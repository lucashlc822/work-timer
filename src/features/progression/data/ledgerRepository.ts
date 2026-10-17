import type { LedgerRow, WorkTimerDb } from '@/shared/db';

import { expectedRows } from '../domain/reconcile';

/**
 * Insert every ledger row that should exist and doesn't (M6). One read-write
 * transaction over sessions and the ledger, so two windows reconciling at once
 * — or a sync pull landing mid-way — can't both add the same row. Rows already
 * present (from this device, or pulled from another) are left exactly as they
 * are. Returns how many rows were added.
 */
export const reconcile = (db: WorkTimerDb, userId: string): Promise<number> =>
  db.transaction('rw', db.sessions, db.ledger, async () => {
    const sessions = await db.sessions.filter((s) => s.outcome === 'completed').toArray();
    const expected = expectedRows({ userId, sessions });
    if (expected.length === 0) return 0;
    const existing = await db.ledger.bulkGet(expected.map((r) => r.id));
    const missing = expected.filter((_, i) => existing[i] === undefined);
    if (missing.length > 0) await db.ledger.bulkAdd(missing);
    return missing.length;
  });

/** The balance is the ledger's sum — never a stored number. */
export const sumDeltas = (rows: readonly Pick<LedgerRow, 'delta'>[]): number =>
  rows.reduce((total, row) => total + row.delta, 0);

/**
 * Read straight from the table, flat, so it is safe inside a live query (a
 * live query whose body awaits nested async helpers can stop updating).
 */
export const readBalance = async (db: WorkTimerDb): Promise<number> =>
  sumDeltas(await db.ledger.toArray());

/** The newest entries first, for the panel. */
export const readRecent = (db: WorkTimerDb, limit: number): Promise<LedgerRow[]> =>
  db.ledger.orderBy('createdAt').reverse().limit(limit).toArray();
