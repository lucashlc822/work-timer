import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';

import { db, type LedgerRow } from '@/shared/db';

import {
  readBalance,
  readDailyGoal,
  readEndedSessions,
  readRecent,
  reconcile,
  setDailyGoal,
} from '../data/ledgerRepository';
import { goalProgress, type GoalProgress } from '../domain/goal';
import type { ConstellationCompletion } from '../domain/reconcile';
import { streakAt } from '../domain/streak';

/** Wait after sessions change before reconciling, so a burst of pulled rows is one pass. */
const RECONCILE_DEBOUNCE_MS = 300;

/**
 * Keeps the ledger in step with the account's sessions, finished
 * constellations and daily goal, for as long as it is mounted (the main window
 * only). Runs on start and again whenever the number of ended sessions, the
 * finished constellations or the goal change — a session finishing here, or
 * arriving from another device through sync. Safe to run anywhere, any number
 * of times: the reconciler only ever adds rows that are missing.
 *
 * `completions` comes from the sky through `app/`; features don't import each
 * other. Until it has loaded (`undefined`) nothing runs, so a constellation
 * bonus is never judged against an empty list.
 */
export const useStardustReconciler = (
  userId: string,
  completions: readonly ConstellationCompletion[] | undefined,
): void => {
  const ended = useLiveQuery(() => db.sessions.filter((s) => s.outcome !== null).count(), []);
  const goalMin = useDailyGoal();

  useEffect(() => {
    if (ended === undefined || goalMin === undefined || completions === undefined) return;
    const timer = setTimeout(() => {
      reconcile(db, userId, completions).catch((e: unknown) =>
        console.error('Stardust reconcile failed', e),
      );
    }, RECONCILE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [ended, goalMin, completions, userId]);
};

/** The live balance; `undefined` until the first read. */
export const useBalance = (): number | undefined => useLiveQuery(() => readBalance(db), []);

/** The newest ledger entries, live. */
export const useRecentLedger = (limit: number): LedgerRow[] | undefined =>
  useLiveQuery(() => readRecent(db, limit), [limit]);

/** The daily goal in focus minutes, live; `undefined` until the first read. */
export const useDailyGoal = (): number | undefined => useLiveQuery(() => readDailyGoal(db), []);

export const updateDailyGoal = (minutes: number): Promise<void> =>
  setDailyGoal(db, minutes, Date.now());

export interface Progress extends GoalProgress {
  streak: number;
}

/** How often the clock is re-read, so the line moves on at midnight with no session to prompt it. */
const NOW_REFRESH_MS = 60_000;

/** Today's progress toward the goal and the current streak, live. */
export const useProgress = (): Progress | undefined => {
  const sessions = useLiveQuery(() => readEndedSessions(db), []);
  const goalMin = useDailyGoal();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), NOW_REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  return useMemo(
    () =>
      sessions === undefined || goalMin === undefined
        ? undefined
        : { ...goalProgress(sessions, goalMin, now), streak: streakAt(sessions, now) },
    [sessions, goalMin, now],
  );
};
