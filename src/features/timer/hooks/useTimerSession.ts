import { useMachine } from '@xstate/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fromPromise } from 'xstate';

import { APP_NAME } from '@/shared/config';
import { db } from '@/shared/db';
import { systemClock } from '@/shared/lib';
import { describeHost, getRuntime, type CompletionNotice, type Runtime } from '@/shared/runtime';

import { endRun, loadActiveRun, setRunTag, skipBreak, startNextBlock } from '../data/runRepository';
import {
  addAwayTime,
  finishSession,
  loadActiveSession,
  setInFlightTag,
  startSession,
} from '../data/sessionRepository';
import { formatDuration } from '../domain/format';
import {
  breakDeadlineId,
  breakEndsAt,
  breakFor,
  breakRemainingMs,
  isBreakOver,
} from '../domain/pomodoro';
import { isComplete, plannedEndAt, remainingMs } from '../domain/session';
import {
  timerMachine,
  type FinishedResult,
  type FinishInput,
  type NextBlockInput,
  type SkipBreakInput,
} from '../domain/timerMachine';
import type {
  ActiveSession,
  PomodoroRun,
  RunBreak,
  RunSummary,
  SessionDraft,
  StartedSession,
} from '../domain/types';

export type TimerStatus =
  | 'loading'
  | 'idle'
  | 'starting'
  | 'running'
  | 'finishing'
  | 'finished'
  | 'onBreak'
  | 'breakOver'
  | 'runSummary';

export interface TimerSession {
  status: TimerStatus;
  runtime: Runtime | null;
  session: ActiveSession | null;
  /** The Pomodoro run in flight, or null. */
  run: PomodoroRun | null;
  result: FinishedResult | null;
  summary: RunSummary | null;
  error: string | null;
  /** True while a write between blocks is in flight; buttons should disable. */
  busy: boolean;
  start: (draft: SessionDraft) => void;
  confirmCancel: () => void;
  dismiss: () => void;
  startNext: () => void;
  skipBreak: () => void;
  endRun: () => void;
  /** Change the tag of the block in flight, or of the run between blocks. */
  setTag: (tagId: string | null) => void;
}

const clock = systemClock;

const minutes = (seconds: number): number => Math.round(seconds / 60);

/** The notice for the break after block `blocksDone`, ending at `b`'s end. */
const breakNotice = (run: PomodoroRun, b: RunBreak): CompletionNotice => ({
  sessionId: breakDeadlineId(run.id, run.blocksDone),
  endsAt: breakEndsAt(b),
  title: APP_NAME,
  body: `Break's over — ready for block ${run.blocksDone + 1}.`,
  label: 'Break',
});

/**
 * The host deadline for a session. A Pomodoro block chains the break that will
 * follow it, so the host can run the break without this webview.
 */
const completionNotice = (
  session: ActiveSession,
  run: PomodoroRun | null,
): CompletionNotice & { then?: CompletionNotice } => {
  const endsAt = plannedEndAt(session);
  if (run === null || session.runId !== run.id) {
    return {
      sessionId: session.id,
      endsAt,
      title: APP_NAME,
      body: `Session complete — ${formatDuration(session.plannedDurationS)} of focus.`,
    };
  }

  const after: PomodoroRun = { ...run, blocksDone: run.blocksDone + 1 };
  const next = breakFor(after.blocksDone, run.settings, endsAt);
  return {
    sessionId: session.id,
    endsAt,
    title: APP_NAME,
    body: `Focus block done — ${minutes(next.durationS)}-min break.`,
    then: breakNotice(after, next),
  };
};

/**
 * Wires the timer machine to the database, the host runtime, and the page's
 * visibility.
 *
 * Responsibilities, and nothing more:
 * - resume whatever was in flight when the window opened (`RESUME`) — a
 *   session, a Pomodoro run between blocks, or both;
 * - tell the machine when a session or break *might* be over (`TICK_DUE`) —
 *   at the deadline, and whenever the window becomes visible again, since a
 *   hidden window's timers are throttled;
 * - track time spent hidden as `awayMs`, which is a statistic and never
 *   decides anything. Only during a session: time away on a break is the
 *   point of the break.
 */
export const useTimerSession = (): TimerSession => {
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Read by machine actions, which are created once and must not go stale.
  const runtimeRef = useRef<Runtime | null>(null);
  /** When the window was hidden during the current session, or null if visible. */
  const hiddenAtRef = useRef<number | null>(null);
  const sessionRef = useRef<ActiveSession | null>(null);

  /**
   * Record time hidden up to `until`, capped at the session's planned end:
   * time after the deadline was not part of the session.
   */
  const flushAway = useCallback(async (until: number) => {
    const session = sessionRef.current;
    const hiddenAt = hiddenAtRef.current;
    if (session === null || hiddenAt === null) return;
    hiddenAtRef.current = null;
    const delta = Math.min(until, plannedEndAt(session)) - hiddenAt;
    if (delta > 0) await addAwayTime(db, session.id, delta);
  }, []);

  const [machine] = useState(() => {
    const host = () => {
      const h = runtimeRef.current;
      if (h === null) throw new Error('runtime not ready');
      return { clock, device: describeHost(h) };
    };

    return timerMachine.provide({
      actors: {
        startSession: fromPromise<StartedSession, SessionDraft>(({ input }) =>
          Promise.resolve().then(() => startSession(db, input, host())),
        ),
        startNextBlock: fromPromise<StartedSession, NextBlockInput>(({ input }) =>
          Promise.resolve().then(() => startNextBlock(db, input.runId, host())),
        ),
        finishSession: fromPromise<PomodoroRun | null, FinishInput>(async ({ input }) => {
          await flushAway(input.ending.endedAt);
          return finishSession(db, input.id, input.ending);
        }),
        skipBreak: fromPromise<PomodoroRun, SkipBreakInput>(({ input }) =>
          skipBreak(db, input.runId, input.now),
        ),
        endRun: fromPromise<RunSummary, { runId: string }>(({ input }) => endRun(db, input.runId)),
      },
      actions: {
        armCompletion: (_, { session, run }) => {
          void runtimeRef.current?.completion.arm(completionNotice(session, run));
        },
        disarmCompletion: (_, { sessionId }) => {
          void runtimeRef.current?.completion.disarm(sessionId);
        },
        // When a block completes live, the host already has this break
        // chained from the block's arm; re-arming the identical notice is a
        // no-op there. It matters after a relaunch, when the host has nothing.
        armBreak: (_, { run }) => {
          if (run.break === null) return;
          void runtimeRef.current?.completion.arm(breakNotice(run, run.break));
        },
        disarmBreak: (_, { run }) => {
          void runtimeRef.current?.completion.disarm(breakDeadlineId(run.id, run.blocksDone));
        },
      },
    });
  });

  const [snapshot, send] = useMachine(machine, { input: { clock } });
  const { session, run, result, summary } = snapshot.context;
  const running = snapshot.matches('running');
  const onBreak = snapshot.matches('onBreak');
  const betweenBlocks = onBreak || snapshot.matches('breakOver');
  const [tagError, setTagError] = useState<string | null>(null);
  const error = snapshot.context.error ?? tagError;

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // Resolve the host, then resume anything left in flight. Both must be ready
  // before RESUME, since resuming re-arms the host deadline.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const host = await getRuntime();
      if (cancelled) return;
      runtimeRef.current = host;
      setRuntime(host);

      try {
        const active = await loadActiveSession(db);
        const activeRun = await loadActiveRun(db);
        if (cancelled) return;
        if (active !== undefined) {
          sessionRef.current = active;
          if (document.visibilityState === 'hidden') hiddenAtRef.current = clock.now();
        }
        if (active !== undefined || activeRun !== undefined) {
          send({ type: 'RESUME', session: active, run: activeRun });
        }
      } catch (e) {
        console.error('Could not load the active session', e);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [send]);

  // Wake at the deadline. Rescheduled rather than trusted: a timer that fires
  // a little early (or a clock that moved) just sets another one.
  useEffect(() => {
    if (!running || session === null) return;

    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(
        () => {
          if (isComplete(session, clock.now())) send({ type: 'TICK_DUE' });
          else schedule();
        },
        remainingMs(session, clock.now()) + 50,
      );
    };
    schedule();
    return () => clearTimeout(timer);
  }, [running, session, send]);

  // The same for the end of a break.
  useEffect(() => {
    const brk = run?.break ?? null;
    if (!onBreak || brk === null) return;

    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(
        () => {
          if (isBreakOver(brk, clock.now())) send({ type: 'TICK_DUE' });
          else schedule();
        },
        breakRemainingMs(brk, clock.now()) + 50,
      );
    };
    schedule();
    return () => clearTimeout(timer);
  }, [onBreak, run, send]);

  // Visibility: count time away during a session, and re-check the deadline
  // on return, since timers in a hidden window may have been throttled past
  // it. During a break only the re-check applies.
  useEffect(() => {
    if (!running && !onBreak) return;

    const onVisibility = () => {
      const now = clock.now();
      if (document.visibilityState === 'hidden') {
        if (running) hiddenAtRef.current ??= now;
        return;
      }
      void flushAway(now).finally(() => send({ type: 'TICK_DUE' }));
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [running, onBreak, flushAway, send]);

  const start = useCallback(
    (draft: SessionDraft) => {
      // Asked here, inside the click, because browsers only show the prompt
      // in response to a user gesture. Short-circuits once decided, so a user
      // who said no is never asked again.
      void runtimeRef.current?.notifications.requestPermission();
      hiddenAtRef.current = null;
      send({ type: 'START', draft });
    },
    [send],
  );

  const startNext = useCallback(() => {
    hiddenAtRef.current = null;
    send({ type: 'START_NEXT' });
  }, [send]);

  const sessionId = session?.id ?? null;
  const runId = run?.id ?? null;
  const setTag = useCallback(
    (tagId: string | null) => {
      void (async () => {
        try {
          // The write decides: a session that ended a moment ago refuses it,
          // and then the screen must not pretend the tag moved.
          if (running && sessionId !== null) {
            if (!(await setInFlightTag(db, sessionId, tagId))) return;
          } else if (betweenBlocks && runId !== null) {
            await setRunTag(db, runId, tagId);
          } else {
            return;
          }
          setTagError(null);
          send({ type: 'TAG_CHANGED', tagId });
        } catch (e) {
          console.error('Could not save the tag', e);
          setTagError('The tag could not be saved.');
        }
      })();
    },
    [running, betweenBlocks, sessionId, runId, send],
  );

  const confirmCancel = useCallback(() => send({ type: 'CANCEL_CONFIRMED' }), [send]);
  const dismiss = useCallback(() => send({ type: 'DISMISS' }), [send]);
  const skip = useCallback(() => send({ type: 'SKIP_BREAK' }), [send]);
  const end = useCallback(() => send({ type: 'END_RUN' }), [send]);

  const status: TimerStatus = !loaded
    ? 'loading'
    : snapshot.matches('idle')
      ? 'idle'
      : snapshot.matches('starting')
        ? 'starting'
        : running
          ? 'running'
          : snapshot.matches('finished')
            ? 'finished'
            : onBreak || snapshot.matches('skipping')
              ? 'onBreak'
              : snapshot.matches('breakOver') || snapshot.matches('startingNext')
                ? 'breakOver'
                : snapshot.matches('runSummary')
                  ? 'runSummary'
                  : snapshot.matches('endingRun')
                    ? run?.break != null && !isBreakOver(run.break, clock.now())
                      ? 'onBreak'
                      : 'breakOver'
                    : 'finishing';

  const busy =
    snapshot.matches('skipping') ||
    snapshot.matches('startingNext') ||
    snapshot.matches('endingRun');

  return {
    status,
    runtime,
    session,
    run,
    result,
    summary,
    error,
    busy,
    start,
    confirmCancel,
    dismiss,
    startNext,
    skipBreak: skip,
    endRun: end,
    setTag,
  };
};
