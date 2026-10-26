import { describe, expect, it, vi } from 'vitest';
import { createActor, fromPromise, waitFor } from 'xstate';

import { createTestClock, type TestClock } from '@/shared/lib';

import { breakFor } from './pomodoro';
import { plannedEndAt } from './session';
import {
  timerMachine,
  type FinishInput,
  type NextBlockInput,
  type SkipBreakInput,
} from './timerMachine';
import type { ActiveSession, PomodoroRun, RunSummary, SessionDraft, StartedSession } from './types';

const START = 1_700_000_000_000;
const MIN = 60_000;

const aSession = (overrides: Partial<ActiveSession> = {}): ActiveSession => ({
  id: 'session-1',
  mode: 'countdown',
  runId: null,
  runIndex: null,
  startedAt: START,
  plannedDurationS: 60,
  seed: 'abcdef0123456789',
  tagId: null,
  device: 'desktop/app',
  awayMs: 0,
  togetherId: null,
  sharedId: null,
  ...overrides,
});

const countdown = (plannedDurationS = 60): SessionDraft => ({
  mode: 'countdown',
  plannedDurationS,
  tagId: null,
});

/** One-minute blocks and breaks; a long break (3 min) after every 2nd block. */
const SETTINGS = { focusS: 60, shortBreakS: 60, longBreakS: 180, blocksPerLongBreak: 2 };
const pomodoro: SessionDraft = { mode: 'pomodoro', settings: SETTINGS, tagId: null };

/**
 * A machine wired to in-memory fakes that behave like the repositories,
 * recording every side effect.
 */
const harness = (clock: TestClock = createTestClock(START), stored: PomodoroRun | null = null) => {
  const finished: FinishInput[] = [];
  const armed: string[] = [];
  const disarmed: string[] = [];
  const armedBreaks: number[] = [];
  const disarmedBreaks: number[] = [];
  let run: PomodoroRun | null = stored;
  let blocks = 0;

  const block = (r: PomodoroRun): ActiveSession => {
    blocks += 1;
    return aSession({
      id: `session-${blocks}`,
      mode: 'pomodoro',
      runId: r.id,
      runIndex: r.blocksDone + 1,
      startedAt: clock.now(),
      plannedDurationS: r.settings.focusS,
    });
  };

  const machine = timerMachine.provide({
    actors: {
      startSession: fromPromise<StartedSession, SessionDraft>(({ input }) => {
        if (input.mode === 'countdown') {
          blocks += 1;
          return Promise.resolve({
            session: aSession({
              id: `session-${blocks}`,
              startedAt: clock.now(),
              plannedDurationS: input.plannedDurationS,
            }),
            run: null,
          });
        }
        run = {
          id: 'run-1',
          startedAt: clock.now(),
          settings: input.settings,
          blocksDone: 0,
          break: null,
        };
        return Promise.resolve({ session: block(run), run });
      }),
      startNextBlock: fromPromise<StartedSession, NextBlockInput>(() => {
        run = { ...run!, break: null };
        return Promise.resolve({ session: block(run), run });
      }),
      finishSession: fromPromise<PomodoroRun | null, FinishInput>(({ input }) => {
        finished.push(input);
        if (run === null) return Promise.resolve(null);
        if (input.ending.outcome === 'cancelled') {
          run = null;
          return Promise.resolve(null);
        }
        const blocksDone = run.blocksDone + 1;
        run = {
          ...run,
          blocksDone,
          break: breakFor(blocksDone, run.settings, input.ending.endedAt),
        };
        return Promise.resolve(run);
      }),
      skipBreak: fromPromise<PomodoroRun, SkipBreakInput>(({ input }) => {
        const b = run!.break!;
        run = {
          ...run!,
          break: { ...b, durationS: Math.floor((input.now - b.startedAt) / 1000) },
        };
        return Promise.resolve(run);
      }),
      endRun: fromPromise<RunSummary, { runId: string }>(() => {
        const summary = { blocks: run?.blocksDone ?? 0, focusS: (run?.blocksDone ?? 0) * 60 };
        run = null;
        return Promise.resolve(summary);
      }),
    },
    actions: {
      armCompletion: (_, params) => {
        armed.push(params.session.id);
      },
      disarmCompletion: (_, params) => {
        disarmed.push(params.sessionId);
      },
      armBreak: (_, params) => {
        armedBreaks.push(params.run.blocksDone);
      },
      disarmBreak: (_, params) => {
        disarmedBreaks.push(params.run.blocksDone);
      },
    },
  });

  const actor = createActor(machine, { input: { clock } });
  actor.start();
  return {
    actor,
    clock,
    finished,
    armed,
    disarmed,
    armedBreaks,
    disarmedBreaks,
    run: () => run,
  };
};

describe('timerMachine', () => {
  it('starts a session and arms the host deadline', async () => {
    const { actor, armed } = harness();

    actor.send({ type: 'START', draft: countdown() });
    await waitFor(actor, (s) => s.matches('running'));

    expect(actor.getSnapshot().context.session?.plannedDurationS).toBe(60);
    expect(armed).toEqual(['session-1']);
  });

  it('ignores an early TICK_DUE — a repaint is not a verdict', async () => {
    const { actor, clock, finished } = harness();
    actor.send({ type: 'START', draft: countdown() });
    await waitFor(actor, (s) => s.matches('running'));

    clock.advance(59_999);
    actor.send({ type: 'TICK_DUE' });

    expect(actor.getSnapshot().matches('running')).toBe(true);
    expect(finished).toEqual([]);
  });

  // O3.8 — completion credits the planned duration and ends at the planned end,
  // even when the TICK_DUE that notices it arrives late.
  it('completes at the planned end, however late the deadline is noticed', async () => {
    const { actor, clock, finished, disarmed } = harness();
    actor.send({ type: 'START', draft: countdown() });
    await waitFor(actor, (s) => s.matches('running'));

    clock.advance(45 * 60_000);
    actor.send({ type: 'TICK_DUE' });
    await waitFor(actor, (s) => s.matches('finished'));

    expect(finished).toEqual([
      {
        id: 'session-1',
        ending: { outcome: 'completed', endedAt: START + 60_000, actualFocusS: 60 },
      },
    ]);
    // Completion clears itself on the host; disarming could race the notice.
    expect(disarmed).toEqual([]);
  });

  // O2.6 — cancelling credits elapsed seconds and disarms the deadline.
  it('cancels with the elapsed seconds and disarms', async () => {
    const { actor, clock, finished, disarmed } = harness();
    actor.send({ type: 'START', draft: countdown() });
    await waitFor(actor, (s) => s.matches('running'));

    clock.advance(20_500);
    actor.send({ type: 'CANCEL_CONFIRMED' });
    await waitFor(actor, (s) => s.matches('finished'));

    expect(finished).toEqual([
      {
        id: 'session-1',
        ending: { outcome: 'cancelled', endedAt: START + 20_500, actualFocusS: 20 },
      },
    ]);
    expect(disarmed).toEqual(['session-1']);
    expect(actor.getSnapshot().context.result?.ending.outcome).toBe('cancelled');
  });

  // O2 — nothing but CANCEL_CONFIRMED ends a session early.
  it('has no event that fails a session other than an explicit cancel', async () => {
    const { actor, clock } = harness();
    actor.send({ type: 'START', draft: countdown() });
    await waitFor(actor, (s) => s.matches('running'));

    clock.advance(30_000);
    actor.send({ type: 'TICK_DUE' });
    actor.send({ type: 'DISMISS' });
    actor.send({ type: 'START', draft: countdown() });

    expect(actor.getSnapshot().matches('running')).toBe(true);
  });

  // O1.1 — resuming mid-session continues, and re-arms (the host may have restarted).
  it('resumes a session that is still running and re-arms it', () => {
    const { actor, clock, armed } = harness(createTestClock(START + 30_000));

    actor.send({ type: 'RESUME', session: aSession() });

    expect(actor.getSnapshot().matches('running')).toBe(true);
    expect(clock.now() - START).toBe(30_000);
    expect(armed).toEqual(['session-1']);
  });

  // O1.2 — the app was quit through the deadline.
  it('finishes a resumed session that ended while the app was closed, dated to its planned end', async () => {
    const session = aSession();
    const { actor, finished, armed } = harness(createTestClock(plannedEndAt(session) + 2 * 60_000));

    actor.send({ type: 'RESUME', session });
    await waitFor(actor, (s) => s.matches('finished'));

    expect(finished).toEqual([
      {
        id: 'session-1',
        ending: { outcome: 'completed', endedAt: START + 60_000, actualFocusS: 60 },
      },
    ]);
    expect(armed).toEqual([]);
    expect(actor.getSnapshot().context.result?.ending.endedAt).toBe(START + 60_000);
  });

  it('returns to idle on DISMISS and can start again', async () => {
    const { actor, clock } = harness();
    actor.send({ type: 'START', draft: countdown() });
    await waitFor(actor, (s) => s.matches('running'));
    clock.advance(60_000);
    actor.send({ type: 'TICK_DUE' });
    await waitFor(actor, (s) => s.matches('finished'));

    actor.send({ type: 'DISMISS' });

    expect(actor.getSnapshot().matches('idle')).toBe(true);
    expect(actor.getSnapshot().context.session).toBeNull();
  });

  it('goes back to idle with an error when the start write fails', async () => {
    const machine = timerMachine.provide({
      actors: {
        startSession: fromPromise<StartedSession, SessionDraft>(() =>
          Promise.reject(new Error('disk full')),
        ),
      },
    });
    const actor = createActor(machine, { input: { clock: createTestClock(START) } });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    actor.start();

    actor.send({ type: 'START', draft: countdown() });
    await waitFor(actor, (s) => s.matches('idle') && s.context.error !== null);

    expect(actor.getSnapshot().context.session).toBeNull();
    errors.mockRestore();
  });
});

describe('timerMachine — Pomodoro', () => {
  const startRun = async (h: ReturnType<typeof harness>) => {
    h.actor.send({ type: 'START', draft: pomodoro });
    await waitFor(h.actor, (s) => s.matches('running'));
  };

  const completeBlock = async (h: ReturnType<typeof harness>) => {
    h.clock.advance(MIN);
    h.actor.send({ type: 'TICK_DUE' });
    await waitFor(h.actor, (s) => s.matches('onBreak') || s.matches('breakOver'));
  };

  // O3.7
  it('goes straight from a completed block into its break, starting at the planned end', async () => {
    const h = harness();
    await startRun(h);

    h.clock.advance(MIN + 5_000); // noticed 5 s late
    h.actor.send({ type: 'TICK_DUE' });
    await waitFor(h.actor, (s) => s.matches('onBreak'));

    const { run, result } = h.actor.getSnapshot().context;
    expect(run?.break).toEqual({ kind: 'short', startedAt: START + MIN, durationS: 60 });
    expect(result?.session.id).toBe('session-1');
    expect(result?.ending.outcome).toBe('completed');
    expect(h.armedBreaks).toEqual([1]);
  });

  // O3.8
  it('stops at "break over" and never starts the next block by itself', async () => {
    const h = harness();
    await startRun(h);
    await completeBlock(h);

    h.clock.advance(MIN);
    h.actor.send({ type: 'TICK_DUE' });
    expect(h.actor.getSnapshot().matches('breakOver')).toBe(true);

    h.clock.advance(10 * MIN);
    h.actor.send({ type: 'TICK_DUE' });
    expect(h.actor.getSnapshot().matches('breakOver')).toBe(true);
    expect(h.armed).toEqual(['session-1']);
  });

  it('ignores an early TICK_DUE during a break', async () => {
    const h = harness();
    await startRun(h);
    await completeBlock(h);

    h.clock.advance(MIN - 1);
    h.actor.send({ type: 'TICK_DUE' });

    expect(h.actor.getSnapshot().matches('onBreak')).toBe(true);
  });

  // O3.9
  it('skips a break into "break over" and disarms its notice', async () => {
    const h = harness();
    await startRun(h);
    await completeBlock(h);

    h.clock.advance(10_000);
    h.actor.send({ type: 'SKIP_BREAK' });
    await waitFor(h.actor, (s) => s.matches('breakOver'));

    expect(h.disarmedBreaks).toEqual([1]);
    expect(h.run()?.break?.durationS).toBe(10);
  });

  // O3.10, O2.4
  it('starts the next block on START_NEXT, and gives a long break after the Nth', async () => {
    const h = harness();
    await startRun(h);
    await completeBlock(h);
    h.actor.send({ type: 'SKIP_BREAK' });
    await waitFor(h.actor, (s) => s.matches('breakOver'));

    h.actor.send({ type: 'START_NEXT' });
    await waitFor(h.actor, (s) => s.matches('running'));
    expect(h.actor.getSnapshot().context.session).toMatchObject({
      id: 'session-2',
      runIndex: 2,
    });
    expect(h.armed).toEqual(['session-1', 'session-2']);

    await completeBlock(h);
    expect(h.actor.getSnapshot().context.run?.break).toMatchObject({
      kind: 'long',
      durationS: 180,
    });
    expect(h.finished.map((f) => f.ending.outcome)).toEqual(['completed', 'completed']);
  });

  // O4.11
  it('ending a block early ends the run and reports the stars it kept', async () => {
    const h = harness();
    await startRun(h);
    await completeBlock(h);
    h.actor.send({ type: 'SKIP_BREAK' });
    await waitFor(h.actor, (s) => s.matches('breakOver'));
    h.actor.send({ type: 'START_NEXT' });
    await waitFor(h.actor, (s) => s.matches('running'));

    h.clock.advance(20_000);
    h.actor.send({ type: 'CANCEL_CONFIRMED' });
    await waitFor(h.actor, (s) => s.matches('finished'));

    const { result, run } = h.actor.getSnapshot().context;
    expect(result?.ending.outcome).toBe('cancelled');
    expect(result?.runBlocksKept).toBe(1);
    expect(run).toBeNull();
    expect(h.disarmed).toEqual(['session-2']);
  });

  it('a countdown result never claims a run', async () => {
    const h = harness();
    h.actor.send({ type: 'START', draft: countdown() });
    await waitFor(h.actor, (s) => s.matches('running'));
    h.actor.send({ type: 'CANCEL_CONFIRMED' });
    await waitFor(h.actor, (s) => s.matches('finished'));

    expect(h.actor.getSnapshot().context.result?.runBlocksKept).toBeNull();
  });

  // O4.12
  it('ends the run from a break with a summary, and returns to idle', async () => {
    const h = harness();
    await startRun(h);
    await completeBlock(h);

    h.actor.send({ type: 'END_RUN' });
    await waitFor(h.actor, (s) => s.matches('runSummary'));

    expect(h.actor.getSnapshot().context.summary).toEqual({ blocks: 1, focusS: 60 });
    expect(h.disarmedBreaks).toEqual([1]);
    expect(h.finished).toHaveLength(1);

    h.actor.send({ type: 'DISMISS' });
    expect(h.actor.getSnapshot().matches('idle')).toBe(true);
    expect(h.actor.getSnapshot().context.run).toBeNull();
  });

  it('can end the run once the break is over, too', async () => {
    const h = harness();
    await startRun(h);
    await completeBlock(h);
    h.clock.advance(MIN);
    h.actor.send({ type: 'TICK_DUE' });

    h.actor.send({ type: 'END_RUN' });
    await waitFor(h.actor, (s) => s.matches('runSummary'));

    // The break had already ended on its own, so there was nothing to disarm.
    expect(h.disarmedBreaks).toEqual([]);
  });
});

// O5.16: every row of the resume table in the plan.
describe('timerMachine: resuming a run', () => {
  const block = aSession({ mode: 'pomodoro', runId: 'run-1', runIndex: 1 });
  const runRow = (overrides: Partial<PomodoroRun> = {}): PomodoroRun => ({
    id: 'run-1',
    startedAt: START,
    settings: SETTINGS,
    blocksDone: 0,
    break: null,
    ...overrides,
  });

  it('a block not yet due: running, re-armed', () => {
    const h = harness(createTestClock(START + 30_000), runRow());

    h.actor.send({ type: 'RESUME', session: block, run: runRow() });

    expect(h.actor.getSnapshot().matches('running')).toBe(true);
    expect(h.armed).toEqual(['session-1']);
  });

  it('a block past its end, break still running: completes it at its planned end, then onBreak', async () => {
    const h = harness(createTestClock(START + MIN + 30_000), runRow());

    h.actor.send({ type: 'RESUME', session: block, run: runRow() });
    await waitFor(h.actor, (s) => s.matches('onBreak'));

    expect(h.finished[0]?.ending).toEqual({
      outcome: 'completed',
      endedAt: START + MIN,
      actualFocusS: 60,
    });
    expect(h.armedBreaks).toEqual([1]);
  });

  // O5.15 at machine level: quit through the block and its break.
  it('a block past its end and its break: completes it, then breakOver', async () => {
    const h = harness(createTestClock(START + 3 * MIN), runRow());

    h.actor.send({ type: 'RESUME', session: block, run: runRow() });
    await waitFor(h.actor, (s) => s.matches('breakOver'));

    expect(h.finished[0]?.ending.endedAt).toBe(START + MIN);
    expect(h.actor.getSnapshot().context.result?.session.id).toBe('session-1');
    expect(h.armedBreaks).toEqual([]);
  });

  it('a countdown past its end: finished, as in M1', async () => {
    const h = harness(createTestClock(START + 3 * MIN));

    h.actor.send({ type: 'RESUME', session: aSession() });
    await waitFor(h.actor, (s) => s.matches('finished'));
  });

  it('no block, break still running: onBreak, re-armed', () => {
    const run = runRow({ blocksDone: 1, break: breakFor(1, SETTINGS, START + MIN) });
    const h = harness(createTestClock(START + MIN + 30_000), run);

    h.actor.send({ type: 'RESUME', run });

    expect(h.actor.getSnapshot().matches('onBreak')).toBe(true);
    expect(h.armedBreaks).toEqual([1]);
  });

  it('no block, break over: breakOver, nothing armed', () => {
    const run = runRow({ blocksDone: 1, break: breakFor(1, SETTINGS, START + MIN) });
    const h = harness(createTestClock(START + 5 * MIN), run);

    h.actor.send({ type: 'RESUME', run });

    expect(h.actor.getSnapshot().matches('breakOver')).toBe(true);
    expect(h.armedBreaks).toEqual([]);
  });

  it('no block and no break recorded: breakOver, ready for the next block', async () => {
    const run = runRow({ blocksDone: 2 });
    const h = harness(createTestClock(START + 5 * MIN), run);

    h.actor.send({ type: 'RESUME', run });
    expect(h.actor.getSnapshot().matches('breakOver')).toBe(true);

    h.actor.send({ type: 'START_NEXT' });
    await waitFor(h.actor, (s) => s.matches('running'));
    expect(h.actor.getSnapshot().context.session?.runIndex).toBe(3);
  });

  it('nothing stored: stays idle', () => {
    const h = harness();

    h.actor.send({ type: 'RESUME' });

    expect(h.actor.getSnapshot().matches('idle')).toBe(true);
  });
});

describe('timerMachine: tags', () => {
  const startRun = async (h: ReturnType<typeof harness>) => {
    h.actor.send({ type: 'START', draft: pomodoro });
    await waitFor(h.actor, (st) => st.matches('running'));
  };
  const completeBlock = async (h: ReturnType<typeof harness>) => {
    h.clock.advance(MIN);
    h.actor.send({ type: 'TICK_DUE' });
    await waitFor(h.actor, (st) => st.matches('onBreak'));
  };

  it('a tag change while running lands on the block and the run', async () => {
    const h = harness();
    await startRun(h);

    h.actor.send({ type: 'TAG_CHANGED', tagId: 'reading' });

    const { session, run } = h.actor.getSnapshot().context;
    expect(session?.tagId).toBe('reading');
    expect(run?.tagId).toBe('reading');
  });

  it('a tag change on a countdown lands on the session alone', async () => {
    const h = harness();
    h.actor.send({ type: 'START', draft: countdown() });
    await waitFor(h.actor, (s) => s.matches('running'));

    h.actor.send({ type: 'TAG_CHANGED', tagId: 'reading' });

    const { session, run } = h.actor.getSnapshot().context;
    expect(session?.tagId).toBe('reading');
    expect(run).toBeNull();
  });

  it('a tag change during a break lands on the run and leaves the finished block alone', async () => {
    const h = harness();
    await startRun(h);
    await completeBlock(h);

    h.actor.send({ type: 'TAG_CHANGED', tagId: 'reading' });

    const { session, run } = h.actor.getSnapshot().context;
    expect(run?.tagId).toBe('reading');
    expect(session?.tagId).toBeNull();
  });

  it('ignores a tag change once the session has finished', async () => {
    const h = harness();
    h.actor.send({ type: 'START', draft: countdown() });
    await waitFor(h.actor, (s) => s.matches('running'));
    h.actor.send({ type: 'CANCEL_CONFIRMED' });
    await waitFor(h.actor, (s) => s.matches('finished'));

    h.actor.send({ type: 'TAG_CHANGED', tagId: 'reading' });

    expect(h.actor.getSnapshot().context.session?.tagId).toBeNull();
  });
});

describe('timerMachine: ended from outside (M7, focus together)', () => {
  // M7 4b, case 2.2 — a friend's cancel ends the session when it happened.
  it('a cancel carrying `at` ends the session then, and says who ended it', async () => {
    const { actor, clock, finished, disarmed } = harness();
    actor.send({ type: 'START', draft: countdown(1500) });
    await waitFor(actor, (s) => s.matches('running'));

    clock.advance(10 * MIN); // the cancel reaches this device a few seconds late
    actor.send({ type: 'CANCEL_CONFIRMED', at: START + 9 * MIN + 55_000, endedBy: 'Bea' });
    await waitFor(actor, (s) => s.matches('finished'));

    expect(finished).toEqual([
      {
        id: 'session-1',
        ending: { outcome: 'cancelled', endedAt: START + 9 * MIN + 55_000, actualFocusS: 595 },
      },
    ]);
    expect(disarmed).toEqual(['session-1']);
    expect(actor.getSnapshot().context.result?.endedBy).toBe('Bea');
  });

  it('a cancel time in this device’s future is clamped to now', async () => {
    const { actor, clock, finished } = harness();
    actor.send({ type: 'START', draft: countdown(1500) });
    await waitFor(actor, (s) => s.matches('running'));

    clock.advance(5 * MIN);
    actor.send({ type: 'CANCEL_CONFIRMED', at: START + 7 * MIN });
    await waitFor(actor, (s) => s.matches('finished'));

    expect(finished[0]?.ending.endedAt).toBe(START + 5 * MIN);
  });

  it('a plain cancel says nobody else ended it, and the next session starts clean', async () => {
    const { actor, clock } = harness();
    actor.send({ type: 'START', draft: countdown() });
    await waitFor(actor, (s) => s.matches('running'));
    clock.advance(10_000);
    actor.send({ type: 'CANCEL_CONFIRMED', at: START + 5_000, endedBy: 'Bea' });
    await waitFor(actor, (s) => s.matches('finished'));
    actor.send({ type: 'DISMISS' });

    actor.send({ type: 'START', draft: countdown() });
    await waitFor(actor, (s) => s.matches('running'));
    clock.advance(20_000);
    actor.send({ type: 'CANCEL_CONFIRMED' });
    await waitFor(actor, (s) => s.matches('finished'));

    expect(actor.getSnapshot().context.result?.endedBy).toBeNull();
    expect(actor.getSnapshot().context.result?.ending.endedAt).toBe(START + 30_000);
  });

  it('a completed session has no `endedBy`', async () => {
    const { actor, clock } = harness();
    actor.send({ type: 'START', draft: countdown() });
    await waitFor(actor, (s) => s.matches('running'));
    clock.advance(60_000);
    actor.send({ type: 'TICK_DUE' });
    await waitFor(actor, (s) => s.matches('finished'));

    expect(actor.getSnapshot().context.result?.endedBy).toBeNull();
  });
});
