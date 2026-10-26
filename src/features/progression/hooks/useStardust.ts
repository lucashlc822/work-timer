import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';

import { db, type LedgerRow } from '@/shared/db';

import {
  buy,
  readBalance,
  readDailyGoal,
  readEndedSessions,
  readEquippedStyle,
  readEquippedTheme,
  readOwned,
  readRecent,
  reconcile,
  setDailyGoal,
  setEquippedStyle,
  setEquippedTheme,
  type BuyResult,
} from '../data/ledgerRepository';
import { boughtTiers, ownedPackKeys, type BuyableTier } from '../domain/catalogue';
import { goalProgress, type GoalProgress } from '../domain/goal';
import type { ConstellationCompletion, SharedCompletion, TogetherWin } from '../domain/reconcile';
import { streakAt } from '../domain/streak';

/** Wait after sessions change before reconciling, so a burst of pulled rows is one pass. */
const RECONCILE_DEBOUNCE_MS = 300;

const NO_WINS: readonly TogetherWin[] = [];
const NO_SHARED: readonly SharedCompletion[] = [];

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
  /** Rooms everyone completed (M7), from the server through `app/`; empty until known. */
  togetherWins: readonly TogetherWin[] = NO_WINS,
  /** Finished shared constellations (M7 phase 5), from the server through `app/`. */
  sharedCompletions: readonly SharedCompletion[] = NO_SHARED,
): void => {
  const ended = useLiveQuery(() => db.sessions.filter((s) => s.outcome !== null).count(), []);
  const goalMin = useDailyGoal();

  useEffect(() => {
    if (ended === undefined || goalMin === undefined || completions === undefined) return;
    const timer = setTimeout(() => {
      reconcile(db, userId, completions, Date.now(), togetherWins, sharedCompletions).catch(
        (e: unknown) => console.error('Stardust reconcile failed', e),
      );
    }, RECONCILE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [ended, goalMin, completions, togetherWins, sharedCompletions, userId]);
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

/** What the account owns, live: the free defaults plus every purchase. */
export const useOwned = (): ReadonlySet<string> | undefined =>
  useLiveQuery(() => readOwned(db), []);

/** The tiers bought early, live; `undefined` until the first read. */
export const useBoughtTiers = (): ReadonlySet<BuyableTier> | undefined => {
  const owned = useOwned();
  return useMemo(() => (owned === undefined ? undefined : boughtTiers(owned)), [owned]);
};

/** The equipped star style, live. */
export const useEquippedStyle = (): string | undefined =>
  useLiveQuery(() => readEquippedStyle(db), []);

export const buyItem = (userId: string, itemKey: string): Promise<BuyResult> =>
  buy(db, userId, itemKey, Date.now());

export const equipStyle = (styleKey: string): Promise<boolean> =>
  setEquippedStyle(db, styleKey, Date.now());

/** The constellation packs owned, live; `undefined` until the first read. */
export const useOwnedPacks = (): ReadonlySet<string> | undefined => {
  const owned = useOwned();
  return useMemo(() => (owned === undefined ? undefined : ownedPackKeys(owned)), [owned]);
};

/** The equipped sky theme, live. */
export const useEquippedSkyTheme = (): string | undefined =>
  useLiveQuery(() => readEquippedTheme(db), []);

export const equipTheme = (themeKey: string): Promise<boolean> =>
  setEquippedTheme(db, themeKey, Date.now());
