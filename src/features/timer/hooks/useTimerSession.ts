import { useMachine } from '@xstate/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fromPromise } from 'xstate';

import { APP_NAME } from '@/shared/config';
import { db } from '@/shared/db';
import { systemClock } from '@/shared/lib';
import { describeHost, getRuntime, type Runtime } from '@/shared/runtime';

import {
  addAwayTime,
  finishSession,
  loadActiveSession,
  startSession,
} from '../data/sessionRepository';
import { formatDuration } from '../domain/format';
import { isComplete, plannedEndAt, remainingMs } from '../domain/session';
import { timerMachine, type FinishedResult, type FinishInput } from '../domain/timerMachine';
import type { ActiveSession, SessionDraft } from '../domain/types';

export type TimerStatus = 'loading' | 'idle' | 'starting' | 'running' | 'finishing' | 'finished';

export interface TimerSession {
  status: TimerStatus;
  runtime: Runtime | null;
  session: ActiveSession | null;
  result: FinishedResult | null;
  error: string | null;
  start: (draft: SessionDraft) => void;
  confirmCancel: () => void;
  dismiss: () => void;
}

const clock = systemClock;

/**
 * Wires the timer machine to the database, the host runtime, and the page's
 * visibility.
 *
 * Responsibilities, and nothing more:
 * - resume whatever was in flight when the window opened (`RESUME`);
 * - tell the machine when the session *might* be over (`TICK_DUE`) — at the
 *   deadline, and whenever the window becomes visible again, since a hidden
 *   window's timers are throttled;
 * - track time spent hidden as `awayMs`, which is a statistic and never
 *   decides anything.
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

  const [machine] = useState(() =>
    timerMachine.provide({
      actors: {
        startSession: fromPromise<ActiveSession, SessionDraft>(({ input }) => {
          const host = runtimeRef.current;
          if (host === null) return Promise.reject(new Error('runtime not ready'));
          return startSession(db, input, { clock, device: describeHost(host) });
        }),
        finishSession: fromPromise<void, FinishInput>(async ({ input }) => {
          await flushAway(input.ending.endedAt);
          await finishSession(db, input.id, input.ending);
        }),
      },
      actions: {
        armCompletion: (_, { session }) => {
          void runtimeRef.current?.completion.arm({
            sessionId: session.id,
            endsAt: plannedEndAt(session),
            title: APP_NAME,
            body: `Session complete — ${formatDuration(session.plannedDurationS)} of focus.`,
          });
        },
        disarmCompletion: (_, { sessionId }) => {
          void runtimeRef.current?.completion.disarm(sessionId);
        },
      },
    }),
  );

  const [snapshot, send] = useMachine(machine, { input: { clock } });
  const { session, result, error } = snapshot.context;
  const running = snapshot.matches('running');

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
        if (cancelled) return;
        if (active !== undefined) {
          sessionRef.current = active;
          if (document.visibilityState === 'hidden') hiddenAtRef.current = clock.now();
          send({ type: 'RESUME', session: active });
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

  // Visibility: count time away, and re-check the deadline on return, since
  // timers in a hidden window may have been throttled past it.
  useEffect(() => {
    if (!running) return;

    const onVisibility = () => {
      const now = clock.now();
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current ??= now;
        return;
      }
      void flushAway(now).finally(() => send({ type: 'TICK_DUE' }));
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [running, flushAway, send]);

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

  const confirmCancel = useCallback(() => send({ type: 'CANCEL_CONFIRMED' }), [send]);
  const dismiss = useCallback(() => send({ type: 'DISMISS' }), [send]);

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
            : 'finishing';

  return { status, runtime, session, result, error, start, confirmCancel, dismiss };
};
