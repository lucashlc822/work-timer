import { assertEvent, assign, fromPromise, setup } from 'xstate';

import type { Clock } from '@/shared/lib';

import { resumeVerdict } from './resume';
import { cancelledEnding, completedEnding, isComplete } from './session';
import type { ActiveSession, SessionDraft, SessionEnding } from './types';

/**
 * The timer's lifecycle: idle -> running -> finished.
 *
 * The machine owns *sequencing* only. Every time question ("is it done?",
 * "how much was focused?") is delegated to `session.ts` with the injected
 * clock, and every side effect (persistence, the host's completion deadline)
 * is a named actor or action that the caller provides. The defaults below
 * reject or do nothing, so a machine that was not wired up fails loudly in
 * tests instead of silently writing nowhere.
 *
 * `starting`, `completing`, and `cancelling` are transient states that exist
 * only while the corresponding database write is in flight, so the UI can
 * never fire a second START or CANCEL into the gap.
 */

export interface FinishedResult {
  session: ActiveSession;
  ending: SessionEnding;
}

export interface TimerContext {
  clock: Clock;
  session: ActiveSession | null;
  /** Computed on entry to `completing`/`cancelling`, written by `finishSession`. */
  ending: SessionEnding | null;
  result: FinishedResult | null;
  error: string | null;
}

export type TimerEvent =
  | { type: 'START'; draft: SessionDraft }
  | { type: 'RESUME'; session: ActiveSession }
  /** "It might be over now" — sent by repaints, deadlines, and visibility. Guarded, so spurious ones are harmless. */
  | { type: 'TICK_DUE' }
  | { type: 'CANCEL_CONFIRMED' }
  | { type: 'DISMISS' };

export interface FinishInput {
  id: string;
  ending: SessionEnding;
}

export const timerMachine = setup({
  types: {
    context: {} as TimerContext,
    events: {} as TimerEvent,
    input: {} as { clock: Clock },
  },
  actors: {
    startSession: fromPromise<ActiveSession, SessionDraft>(() =>
      Promise.reject(new Error('timerMachine: startSession was not provided')),
    ),
    finishSession: fromPromise<void, FinishInput>(() =>
      Promise.reject(new Error('timerMachine: finishSession was not provided')),
    ),
  },
  actions: {
    /** Tell the host the session ends at its planned end. Replaces any previous arm. */
    armCompletion: (_, _params: { session: ActiveSession }) => {},
    /** Forget the host deadline. Only on cancel — a completion clears itself. */
    disarmCompletion: (_, _params: { sessionId: string }) => {},
  },
  guards: {
    resumedComplete: ({ context, event }) => {
      assertEvent(event, 'RESUME');
      return resumeVerdict(event.session, context.clock.now()).kind === 'completed';
    },
    sessionComplete: ({ context }) =>
      context.session !== null && isComplete(context.session, context.clock.now()),
  },
}).createMachine({
  id: 'timer',
  context: ({ input }) => ({
    clock: input.clock,
    session: null,
    ending: null,
    result: null,
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
            actions: assign({ session: ({ event }) => event.session }),
          },
          {
            target: 'running',
            actions: [
              assign({ session: ({ event }) => event.session }),
              {
                type: 'armCompletion',
                params: ({ event }) => ({ session: event.session }),
              },
            ],
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
            assign({ session: ({ event }) => event.output, error: null }),
            {
              type: 'armCompletion',
              params: ({ event }) => ({ session: event.output }),
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
        onDone: { target: 'finished' },
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
        result: ({ context }) => ({ session: context.session!, ending: context.ending! }),
      }),
      on: {
        DISMISS: {
          target: 'idle',
          actions: assign({ session: null, ending: null, result: null, error: null }),
        },
      },
    },
  },
});
