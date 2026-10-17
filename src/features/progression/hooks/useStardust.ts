import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect } from 'react';

import { db, type LedgerRow } from '@/shared/db';

import { readBalance, readRecent, reconcile } from '../data/ledgerRepository';

/** Wait after sessions change before reconciling, so a burst of pulled rows is one pass. */
const RECONCILE_DEBOUNCE_MS = 300;

/**
 * Keeps the ledger in step with the account's sessions, for as long as it is
 * mounted (the main window only). Runs on start and again whenever the number
 * of completed sessions changes — a session finishing here, or arriving from
 * another device through sync. Safe to run anywhere, any number of times: the
 * reconciler only ever adds rows that are missing.
 */
export const useStardustReconciler = (userId: string): void => {
  const completed = useLiveQuery(
    () => db.sessions.filter((s) => s.outcome === 'completed').count(),
    [],
  );

  useEffect(() => {
    if (completed === undefined) return;
    const timer = setTimeout(() => {
      reconcile(db, userId).catch((e: unknown) => console.error('Stardust reconcile failed', e));
    }, RECONCILE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [completed, userId]);
};

/** The live balance; `undefined` until the first read. */
export const useBalance = (): number | undefined => useLiveQuery(() => readBalance(db), []);

/** The newest ledger entries, live. */
export const useRecentLedger = (limit: number): LedgerRow[] | undefined =>
  useLiveQuery(() => readRecent(db, limit), [limit]);
