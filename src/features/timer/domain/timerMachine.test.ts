import { describe, expect, it, vi } from 'vitest';
import { createActor, fromPromise, waitFor } from 'xstate';

import { createTestClock, type TestClock } from '@/shared/lib';

import { plannedEndAt } from './session';
import { timerMachine, type FinishInput } from './timerMachine';
import type { ActiveSession, SessionDraft } from './types';

const START = 1_700_000_000_000;

const aSession = (overrides: Partial<ActiveSession> = {}): ActiveSession => ({
  id: 'session-1',
  startedAt: START,
  plannedDurationS: 60,
  seed: 'abcdef0123456789',
  tagId: null,
  device: 'desktop/app',
  awayMs: 0,
  ...overrides,
});

/** A machine wired to in-memory fakes, recording every side effect. */
const harness = (clock: TestClock = createTestClock(START)) => {
  const finished: FinishInput[] = [];
  const armed: string[] = [];
  const disarmed: string[] = [];

  const machine = timerMachine.provide({
    actors: {
      startSession: fromPromise<ActiveSession, SessionDraft>(({ input }) =>
        Promise.resolve(
          aSession({ startedAt: clock.now(), plannedDurationS: input.plannedDurationS }),
        ),
      ),
      finishSession: fromPromise<void, FinishInput>(({ input }) => {
        finished.push(input);
        return Promise.resolve();
      }),
    },
    actions: {
      armCompletion: (_, params) => {
        armed.push(params.session.id);
      },
      disarmCompletion: (_, params) => {
        disarmed.push(params.sessionId);
      },
    },
  });

  const actor = createActor(machine, { input: { clock } });
  actor.start();
  return { actor, clock, finished, armed, disarmed };
};

describe('timerMachine', () => {
  it('starts a session and arms the host deadline', async () => {
    const { actor, armed } = harness();

    actor.send({ type: 'START', draft: { plannedDurationS: 60, tagId: null } });
    await waitFor(actor, (s) => s.matches('running'));

    expect(actor.getSnapshot().context.session?.plannedDurationS).toBe(60);
    expect(armed).toEqual(['session-1']);
  });

  it('ignores an early TICK_DUE — a repaint is not a verdict', async () => {
    const { actor, clock, finished } = harness();
    actor.send({ type: 'START', draft: { plannedDurationS: 60, tagId: null } });
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
    actor.send({ type: 'START', draft: { plannedDurationS: 60, tagId: null } });
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
    actor.send({ type: 'START', draft: { plannedDurationS: 60, tagId: null } });
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
    actor.send({ type: 'START', draft: { plannedDurationS: 60, tagId: null } });
    await waitFor(actor, (s) => s.matches('running'));

    clock.advance(30_000);
    actor.send({ type: 'TICK_DUE' });
    actor.send({ type: 'DISMISS' });
    actor.send({ type: 'START', draft: { plannedDurationS: 60, tagId: null } });

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
    actor.send({ type: 'START', draft: { plannedDurationS: 60, tagId: null } });
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
        startSession: fromPromise<ActiveSession, SessionDraft>(() =>
          Promise.reject(new Error('disk full')),
        ),
      },
    });
    const actor = createActor(machine, { input: { clock: createTestClock(START) } });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    actor.start();

    actor.send({ type: 'START', draft: { plannedDurationS: 60, tagId: null } });
    await waitFor(actor, (s) => s.matches('idle') && s.context.error !== null);

    expect(actor.getSnapshot().context.session).toBeNull();
    errors.mockRestore();
  });
});
