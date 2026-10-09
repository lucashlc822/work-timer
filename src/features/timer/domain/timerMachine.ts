import { assertEvent, assign, fromPromise, setup } from 'xstate';

import type { Clock } from '@/shared/lib';

import { isBreakOver } from './pomodoro';
import { resumeVerdict } from './resume';
import { cancelledEnding, completedEnding, isComplete } from './session';
import type {
  ActiveSession,
  PomodoroRun,
  RunSummary,
  SessionDraft,
  SessionEnding,
  StartedSession,
} from './types';

/**
 * The timer's lifecycle: idle -> running -> finished, and for Pomodoro a loop
 * of running -> onBreak -> breakOver -> running until the run ends.
 *
 * The machine owns *sequencing* only. Every time question ("is it done?",
 * "is the break over?") is delegated to `session.ts` and `pomodoro.ts` with
 * the injected clock, and every side effect (persistence, the host's
 * deadlines) is a named actor or action that the caller provides. The
 * defaults below reject or do nothing, so a machine that was not wired up
 * fails loudly in tests instead of silently writing nowhere.
 *
 * States ending in `-ing` (`starting`, `completing`, `skipping`, ...) are
 * transient: they exist only while the corresponding database write is in
 * flight, so the UI can never fire a second START, CANCEL or START_NEXT into
 * the gap.
 *
 * Nothing moves from `breakOver` to `running` without START_NEXT. A block
 * never starts on its own, so no star can be earned while the user is away.
 */

export interface FinishedResult {
  session: ActiveSession;
  ending: SessionEnding;
  /** Stars the run kept when this cancelled block ended it; null otherwise. */
  runBlocksKept: number | null;
}

export interface TimerContext {
  clock: Clock;
  session: ActiveSession | null;
  /** The Pomodoro run in flight, or null for a countdown or no run. */
  run: PomodoroRun | null;
  /** Computed on entry to `completing`/`cancelling`, written by `finishSession`. */
  ending: SessionEnding | null;
  /** The last finished session: the result screen, or the star on the break screen. */
  result: FinishedResult | null;
  summary: RunSummary | null;
  error: string | null;
}

export type TimerEvent =
  | { type: 'START'; draft: SessionDraft }
  | { type: 'RESUME'; session?: ActiveSession | undefined; run?: PomodoroRun | undefined }
  /** "It might be over now" — sent by repaints, deadlines, and visibility. Guarded, so spurious ones are harmless. */
  | { type: 'TICK_DUE' }
  | { type: 'CANCEL_CONFIRMED' }
  | { type: 'DISMISS' }
  | { type: 'SKIP_BREAK' }
  | { type: 'START_NEXT' }
  | { type: 'END_RUN' }
  /** The write already landed; this brings the context in line with it. */
  | { type: 'TAG_CHANGED'; tagId: string | null };

export interface FinishInput {
  id: string;
  ending: SessionEnding;
}

export interface NextBlockInput {
  runId: string;
}

export interface SkipBreakInput {
  runId: string;
  now: number;
}

const notWired = (name: string) => () =>
  Promise.reject(new Error(`timerMachine: ${name} was not provided`));

const onBreakNow = (run: PomodoroRun | null, now: number): run is PomodoroRun =>
  run?.break != null && !isBreakOver(run.break, now);

export const timerMachine = setup({
  types: {
    context: {} as TimerContext,
    events: {} as TimerEvent,
    input: {} as { clock: Clock },
  },
  actors: {
    startSession: fromPromise<StartedSession, SessionDraft>(notWired('startSession')),
    startNextBlock: fromPromise<StartedSession, NextBlockInput>(notWired('startNextBlock')),
    /** Resolves to the run as it stands afterwards, or null when there is none. */
    finishSession: fromPromise<PomodoroRun | null, FinishInput>(notWired('finishSession')),
    skipBreak: fromPromise<PomodoroRun, SkipBreakInput>(notWired('skipBreak')),
    endRun: fromPromise<RunSummary, { runId: string }>(notWired('endRun')),
  },
  actions: {
    /**
     * Mirror a tag change that has already been persisted: onto the block in
     * flight, and onto the run so the next block carries it.
     */
    applyTag: assign({
      session: ({ context, event }) => {
        assertEvent(event, 'TAG_CHANGED');
        return context.session === null ? null : { ...context.session, tagId: event.tagId };
      },
      run: ({ context, event }) => {
        assertEvent(event, 'TAG_CHANGED');
        return context.run === null ? null : { ...context.run, tagId: event.tagId };
      },
    }),
    /** Between blocks `session` is the finished block, which must stay as it ended. */
    applyRunTag: assign({
      run: ({ context, event }) => {
        assertEvent(event, 'TAG_CHANGED');
        return context.run === null ? null : { ...context.run, tagId: event.tagId };
      },
    }),
    /**
     * Tell the host the session ends at its planned end. Replaces any previous
     * arm. For a Pomodoro block the host also chains the break after it, so
     * the break's notice fires on time even if this webview is throttled.
     */
    armCompletion: (_, _params: { session: ActiveSession; run: PomodoroRun | null }) => {},
    /** Forget the host deadline. Only on cancel — a completion clears itself. */
    disarmCompletion: (_, _params: { sessionId: string }) => {},
    /** Tell the host the run's current break ends at its end. Replaces any previous arm. */
    armBreak: (_, _params: { run: PomodoroRun }) => {},
    /** Forget the break deadline (skipped or run ended). */
    disarmBreak: (_, _params: { run: PomodoroRun }) => {},
  },
  guards: {
    resumedComplete: ({ context, event }) => {
      assertEvent(event, 'RESUME');
      return (
        event.session !== undefined &&
        resumeVerdict(event.session, context.clock.now()).kind === 'completed'
      );
    },
    resumedSession: ({ event }) => {
      assertEvent(event, 'RESUME');
      return event.session !== undefined;
    },
    resumedOnBreak: ({ context, event }) => {
      assertEvent(event, 'RESUME');
      return onBreakNow(event.run ?? null, context.clock.now());
    },
    resumedRun: ({ event }) => {
      assertEvent(event, 'RESUME');
      return event.run !== undefined;
    },
    sessionComplete: ({ context }) =>
      context.session !== null && isComplete(context.session, context.clock.now()),
    breakOver: ({ context }) => !onBreakNow(context.run, context.clock.now()),
  },
}).createMachine({
  id: 'timer',
  context: ({ input }) => ({
    clock: input.clock,
    session: null,
    run: null,
    ending: null,
    result: null,
    summary: null,
    error: null,
  }),
  initial: 'idle',
  states: {
    idle: {
      on: {
        START: { target: 'starting' },
        RESUME: [
          {
            guard: 'resumedComplete',
            target: 'completing',
            actions: assign({
              session: ({ event }) => event.session!,
              run: ({ event }) => event.run ?? null,
            }),
          },
          {
            guard: 'resumedSession',
            target: 'running',
            actions: [
              assign({
                session: ({ event }) => event.session!,
                run: ({ event }) => event.run ?? null,
              }),
              {
                type: 'armCompletion',
                params: ({ event }) => ({ session: event.session!, run: event.run ?? null }),
              },
            ],
          },
          {
            guard: 'resumedOnBreak',
            target: 'onBreak',
            actions: [
              assign({ run: ({ event }) => event.run! }),
              { type: 'armBreak', params: ({ event }) => ({ run: event.run! }) },
            ],
          },
          {
            guard: 'resumedRun',
            target: 'breakOver',
            actions: assign({ run: ({ event }) => event.run! }),
          },
        ],
      },
    },

    starting: {
      invoke: {
        src: 'startSession',
        input: ({ event }) => {
          assertEvent(event, 'START');
          return event.draft;
        },
        onDone: {
          target: 'running',
          actions: [
            assign({
              session: ({ event }) => event.output.session,
              run: ({ event }) => event.output.run,
              error: null,
            }),
            {
              type: 'armCompletion',
              params: ({ event }) => ({ session: event.output.session, run: event.output.run }),
            },
          ],
        },
        onError: {
          target: 'idle',
          actions: assign({ error: 'The session could not be started.' }),
        },
      },
    },

    running: {
      on: {
        TAG_CHANGED: { actions: 'applyTag' },
        TICK_DUE: { guard: 'sessionComplete', target: 'completing' },
        CANCEL_CONFIRMED: {
          target: 'cancelling',
          actions: {
            type: 'disarmCompletion',
            params: ({ context }) => ({ sessionId: context.session!.id }),
          },
        },
      },
    },

    completing: {
      entry: assign({ ending: ({ context }) => completedEnding(context.session!) }),
      invoke: {
        src: 'finishSession',
        input: ({ context }) => ({ id: context.session!.id, ending: context.ending! }),
        onDone: [
          // A Pomodoro block: straight into its break, with the new star on show.
          {
            guard: ({ context, event }) => onBreakNow(event.output, context.clock.now()),
            target: 'onBreak',
            actions: [
              assign({
                run: ({ event }) => event.output,
                result: ({ context }) => ({
                  session: context.session!,
                  ending: context.ending!,
                  runBlocksKept: null,
                }),
              }),
              { type: 'armBreak', params: ({ event }) => ({ run: event.output! }) },
            ],
          },
          // A block whose break had also run out while the app was away.
          {
            guard: ({ event }) => event.output !== null,
            target: 'breakOver',
            actions: assign({
              run: ({ event }) => event.output,
              result: ({ context }) => ({
                session: context.session!,
                ending: context.ending!,
                runBlocksKept: null,
              }),
            }),
          },
          { target: 'finished' },
        ],
        // The row is still in flight on disk, so the next launch resumes it and
        // tries again. Show the result regardless — the session *did* end.
        onError: {
          target: 'finished',
          actions: assign({ error: 'The result could not be saved yet.' }),
        },
      },
    },

    cancelling: {
      entry: assign({
        ending: ({ context }) => cancelledEnding(context.session!, context.clock.now()),
      }),
      invoke: {
        src: 'finishSession',
        input: ({ context }) => ({ id: context.session!.id, ending: context.ending! }),
        onDone: { target: 'finished' },
        onError: {
          target: 'finished',
          actions: assign({ error: 'The result could not be saved yet.' }),
        },
      },
    },

    finished: {
      entry: assign({
        result: ({ context }) => ({
          session: context.session!,
          ending: context.ending!,
          runBlocksKept:
            context.session!.runId !== null && context.ending!.outcome === 'cancelled'
              ? (context.run?.blocksDone ?? 0)
              : null,
        }),
        run: null,
      }),
      on: {
        DISMISS: {
          target: 'idle',
          actions: assign({ session: null, ending: null, result: null, error: null }),
        },
      },
    },

    onBreak: {
      on: {
        TAG_CHANGED: { actions: 'applyRunTag' },
        TICK_DUE: { guard: 'breakOver', target: 'breakOver' },
        SKIP_BREAK: {
          target: 'skipping',
          actions: { type: 'disarmBreak', params: ({ context }) => ({ run: context.run! }) },
        },
        END_RUN: {
          target: 'endingRun',
          actions: { type: 'disarmBreak', params: ({ context }) => ({ run: context.run! }) },
        },
      },
    },

    skipping: {
      invoke: {
        src: 'skipBreak',
        input: ({ context }) => ({ runId: context.run!.id, now: context.clock.now() }),
        onDone: { target: 'breakOver', actions: assign({ run: ({ event }) => event.output }) },
        // Still on disk as a running break, so a reload shows the break again.
        onError: {
          target: 'breakOver',
          actions: assign({ error: 'Skipping the break could not be saved.' }),
        },
      },
    },

    breakOver: {
      on: {
        TAG_CHANGED: { actions: 'applyRunTag' },
        START_NEXT: { target: 'startingNext' },
        END_RUN: { target: 'endingRun' },
      },
    },

    startingNext: {
      invoke: {
        src: 'startNextBlock',
        input: ({ context }) => ({ runId: context.run!.id }),
        onDone: {
          target: 'running',
          actions: [
            assign({
              session: ({ event }) => event.output.session,
              run: ({ event }) => event.output.run,
              ending: null,
              result: null,
              error: null,
            }),
            {
              type: 'armCompletion',
              params: ({ event }) => ({ session: event.output.session, run: event.output.run }),
            },
          ],
        },
        onError: {
          target: 'breakOver',
          actions: assign({ error: 'The next block could not be started.' }),
        },
      },
    },

    endingRun: {
      invoke: {
        src: 'endRun',
        input: ({ context }) => ({ runId: context.run!.id }),
        onDone: {
          target: 'runSummary',
          actions: assign({ summary: ({ event }) => event.output, run: null, error: null }),
        },
        onError: {
          target: 'breakOver',
          actions: assign({ error: 'The run could not be ended.' }),
        },
      },
    },

    runSummary: {
      on: {
        DISMISS: {
          target: 'idle',
          actions: assign({
            session: null,
            ending: null,
            result: null,
            summary: null,
            error: null,
          }),
        },
      },
    },
  },
});
