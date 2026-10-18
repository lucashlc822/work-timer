import {
  META_KEYS,
  readMeta,
  touchSettings,
  writeMeta,
  type LedgerRow,
  type WorkTimerDb,
} from '@/shared/db';
import { stableId } from '@/shared/lib';

import { DEFAULT_STYLE_KEY, DEFAULT_THEME_KEY, itemByKey, ownedKeys } from '../domain/catalogue';
import { clampDailyGoal, DEFAULT_DAILY_GOAL_MIN } from '../domain/economy';
import { expectedRows, purchaseKey, type ConstellationCompletion } from '../domain/reconcile';

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

export type BuyResult =
  { ok: true } | { ok: false; reason: 'unknown' | 'free' | 'owned' | 'insufficient' };

/**
 * Buy an item: one ledger row with a negative `delta`, id derived from the
 * account and the item (`purchase:<itemKey>`). Refused when the item is
 * unknown, free, already owned, or costs more than the balance. One
 * transaction, so a double click or two windows can't buy it twice; and across
 * devices the shared id means two offline buys collapse to one deduction.
 *
 * Two devices buying *different* items offline can push the balance below
 * zero. That is shown as it is, and buying waits until it is positive again.
 */
export const buy = (
  db: WorkTimerDb,
  userId: string,
  itemKey: string,
  now: number,
): Promise<BuyResult> =>
  db.transaction('rw', db.ledger, async (): Promise<BuyResult> => {
    const item = itemByKey(itemKey);
    if (item === undefined) return { ok: false, reason: 'unknown' };
    if (item.price <= 0) return { ok: false, reason: 'free' };

    const rows = await db.ledger.toArray();
    if (ownedKeys(rows).has(itemKey)) return { ok: false, reason: 'owned' };
    if (sumDeltas(rows) < item.price) return { ok: false, reason: 'insufficient' };

    await db.ledger.add({
      id: stableId(purchaseKey(userId, itemKey)),
      reason: 'purchase',
      delta: -item.price,
      ref: itemKey,
      createdAt: now,
      syncedAt: null,
    });
    return { ok: true };
  });

/** What is owned: the free defaults plus every purchase. Flat, safe in a live query. */
export const readOwned = async (db: WorkTimerDb): Promise<ReadonlySet<string>> =>
  ownedKeys(await db.ledger.toArray());

/** The star style new stars are born with; classic until another is equipped. */
export const readEquippedStyle = async (db: WorkTimerDb): Promise<string> => {
  const stored = await readMeta<unknown>(db, META_KEYS.starStyle);
  return typeof stored === 'string' ? stored : DEFAULT_STYLE_KEY;
};

/**
 * Equip an owned star style: it applies to stars born from now on, and syncs to
 * the account's other devices (newest edit wins). Resolves to false, changing
 * nothing, for a style that isn't owned � owning is checked here, not only in
 * the UI.
 */
export const setEquippedStyle = (
  db: WorkTimerDb,
  styleKey: string,
  now: number,
): Promise<boolean> =>
  db.transaction('rw', db.ledger, db.meta, async () => {
    const rows = await db.ledger.toArray();
    if (!ownedKeys(rows).has(`style.${styleKey}`)) return false;
    await writeMeta(db, META_KEYS.starStyle, styleKey);
    await touchSettings(db, now);
    return true;
  });

/** The sky theme in force; the original night until another is equipped. */
export const readEquippedTheme = async (db: WorkTimerDb): Promise<string> => {
  const stored = await readMeta<unknown>(db, META_KEYS.skyTheme);
  return typeof stored === 'string' ? stored : DEFAULT_THEME_KEY;
};

/**
 * Equip an owned sky theme; it re-skins the sky at once and syncs to the
 * account's other devices (newest edit wins). Resolves to false, changing
 * nothing, for a theme that isn't owned.
 */
export const setEquippedTheme = (
  db: WorkTimerDb,
  themeKey: string,
  now: number,
): Promise<boolean> =>
  db.transaction('rw', db.ledger, db.meta, async () => {
    const rows = await db.ledger.toArray();
    if (!ownedKeys(rows).has(`theme.${themeKey}`)) return false;
    await writeMeta(db, META_KEYS.skyTheme, themeKey);
    await touchSettings(db, now);
    return true;
  });
