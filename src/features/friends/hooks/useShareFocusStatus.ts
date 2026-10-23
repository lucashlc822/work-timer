import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';

import { getSupabase } from '@/shared/backend';
import { db, META_KEYS, type PomodoroRunRow } from '@/shared/db';

import { clearFocusStatus, setFocusStatus } from '../data/friendsRepository';
import {
  currentStatus,
  sameStatus,
  type FocusStatus,
  type TimerState,
} from '../domain/focusStatus';

/**
 * Shares "Focusing now" with friends (M7 phase 3): watches the timer's stored
 * state and tells the server whenever it changes.
 *
 * Reads the running session and the Pomodoro run straight from `shared/db` —
 * the same storage contract the sky reads — never through the timer feature.
 * The live query is kept flat (one `bulkGet`, then one `get`): a chain of
 * nested async helpers inside a live query makes Dexie stop re-running it.
 *
 * Best effort and silent: sharing never blocks or interrupts a session. A
 * failed send is retried on the next change, when the connection returns, and
 * when the window comes back into view. Opening the app while idle sends
 * nothing, so it can't wipe what another of your devices is sharing.
 */
export const useShareFocusStatus = (): void => {
  const timer = useLiveQuery(async (): Promise<TimerState> => {
    const [idRow, runRow] = await db.meta.bulkGet([META_KEYS.activeSessionId, META_KEYS.activeRun]);
    const id = idRow?.value;
    const session = typeof id === 'string' ? await db.sessions.get(id) : undefined;
    const run = runRow?.value as PomodoroRunRow | undefined;
    return {
      session:
        session === undefined
          ? null
          : {
              startedAt: session.startedAt,
              plannedDurationS: session.plannedDurationS,
              endedAt: session.endedAt,
            },
      runBreak:
        run?.break == null
          ? null
          : { startedAt: run.break.startedAt, durationS: run.break.durationS },
    };
  }, []);

  // What the server last accepted from this device. Starts as "idle", so an
  // idle start sends nothing.
  const sent = useRef<FocusStatus | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (timer === undefined) return;
    const status = currentStatus(timer, Date.now());
    if (sameStatus(sent.current, status)) return;
    const client = getSupabase();
    if (client === null) return;

    let current = true;
    (status === null ? clearFocusStatus(client) : setFocusStatus(client, status)).then(
      () => {
        if (current) sent.current = status;
      },
      () => {
        // Offline or refused: left for the next change or retry.
      },
    );
    return () => {
      current = false;
    };
  }, [timer, attempt]);

  useEffect(() => {
    const retry = () => {
      if (document.visibilityState === 'visible') setAttempt((n) => n + 1);
    };
    window.addEventListener('online', retry);
    document.addEventListener('visibilitychange', retry);
    return () => {
      window.removeEventListener('online', retry);
      document.removeEventListener('visibilitychange', retry);
    };
  }, []);
};
