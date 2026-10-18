import {
  META_KEYS,
  readMeta,
  touchSettings,
  writeMeta,
  type LedgerRow,
  type WorkTimerDb,
} from '@/shared/db';

import { clampDailyGoal, DEFAULT_DAILY_GOAL_MIN } from '../domain/economy';
import { expectedRows, type ConstellationCompletion } from '../domain/reconcile';

/**
 * Insert every ledger row that should exist and doesn't (M6). One read-write
 * transaction over sessions and the ledger, so two windows reconciling at once
 * — or a sync pull landing mid-way — can't both add the same row. Rows already
 * present (from this device, or pulled from another) are left exactly as they
 * are. Returns how many rows were added.
 */
export const reconcile = (
  db: WorkTimerDb,
  userId: string,
  completions: readonly ConstellationCompletion[] = [],
  now: number = Date.now(),
): Promise<number> =>
  db.transaction('rw', db.sessions, db.ledger, db.meta, async () => {
    // Every ended session, not just completed ones: an early ending's focus
    // still counts toward the day's goal.
    const sessions = await db.sessions.filter((s) => s.outcome !== null).toArray();
    const goalMin = await readDailyGoal(db);
    const expected = expectedRows({ userId, sessions, completions, goalMin, now });
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

/** The daily goal in focus minutes; the default until the person sets one. */
export const readDailyGoal = async (db: WorkTimerDb): Promise<number> => {
  const stored = await readMeta<unknown>(db, META_KEYS.dailyGoalMin);
  return typeof stored === 'number' && Number.isFinite(stored)
    ? clampDailyGoal(stored)
    : DEFAULT_DAILY_GOAL_MIN;
};

/**
 * Set the daily goal. Stamps the synced settings, so it reaches the account's
 * other devices (newest edit wins).
 */
export const setDailyGoal = (db: WorkTimerDb, minutes: number, now: number): Promise<void> =>
  db.transaction('rw', db.meta, async () => {
    await writeMeta(db, META_KEYS.dailyGoalMin, clampDailyGoal(minutes));
    await touchSettings(db, now);
  });

/** Sessions the progress line needs: the ended ones, flat, safe in a live query. */
export const readEndedSessions = (db: WorkTimerDb) =>
  db.sessions.filter((s) => s.outcome !== null).toArray();
