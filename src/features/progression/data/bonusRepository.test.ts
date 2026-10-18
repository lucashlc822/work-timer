import { afterEach, describe, expect, it } from 'vitest';

import { createDb, META_KEYS, readMeta, type SessionRow, type WorkTimerDb } from '@/shared/db';
import { createTestClock } from '@/shared/lib';
import { createSyncEngine } from '@/shared/sync';
import { FakeRemote } from '@/shared/sync/fakeRemote';

import type { ConstellationCompletion } from '../domain/reconcile';
import { readBalance, readDailyGoal, reconcile, setDailyGoal } from './ledgerRepository';

const opened: WorkTimerDb[] = [];
const newDb = (): WorkTimerDb => {
  const db = createDb(`test-${crypto.randomUUID()}`);
  opened.push(db);
  return db;
};
afterEach(async () => {
  while (opened.length > 0) await opened.pop()?.delete();
});

const T0 = Date.parse('2026-10-08T09:00:00.000Z');
const NOW = T0 + 1_800_000;
const USER = '11111111-1111-4111-8111-111111111111';

/** 25 focused minutes starting at T0, so it lands on the local day of NOW. */
const session = (o: Partial<SessionRow> = {}): SessionRow => ({
  id: crypto.randomUUID(),
  mode: 'countdown',
  plannedDurationS: 1500,
  actualFocusS: 1500,
  startedAt: T0,
  endedAt: T0 + 1_500_000,
  outcome: 'completed',
  awayMs: 0,
  tagId: null,
  seed: 'seed',
  device: 'desktop/app',
  clientCreatedAt: T0,
  syncedAt: null,
  ...o,
});

const medium: ConstellationCompletion[] = [{ choiceId: 'c1', tier: 'medium', completedAt: T0 }];
const easy: ConstellationCompletion[] = [{ choiceId: 'c1', tier: 'easy', completedAt: T0 }];

describe('bonuses in the ledger', () => {
  it('pays a finished constellation once, however often it reconciles (case 6)', async () => {
    const db = newDb();
    expect(await reconcile(db, USER, medium, NOW)).toBe(1);
    expect(await reconcile(db, USER, medium, NOW)).toBe(0);
    expect(await readBalance(db)).toBe(75);
  });

  it('pays the goal bonus from the stored goal, once (case 5)', async () => {
    const db = newDb();
    await db.sessions.add(session());
    await setDailyGoal(db, 20, NOW);

    await reconcile(db, USER, [], NOW);
    await reconcile(db, USER, [], NOW);
    expect((await db.ledger.toArray()).map((r) => r.reason).sort()).toEqual(['goal', 'session']);
    expect(await readBalance(db)).toBe(25 + 20);
  });

  it('pays no goal bonus for a 25-minute day at the default 60-minute goal', async () => {
    const db = newDb();
    await db.sessions.add(session());
    await reconcile(db, USER, [], NOW);
    expect(await db.ledger.count()).toBe(1);
    expect(await readDailyGoal(db)).toBe(60);
  });

  it('counts an early ending toward the goal but pays no Stardust for the minutes', async () => {
    const db = newDb();
    await db.sessions.add(session({ outcome: 'cancelled' }));
    await setDailyGoal(db, 20, NOW);
    await reconcile(db, USER, [], NOW);
    expect((await db.ledger.toArray()).map((r) => r.reason)).toEqual(['goal']);
  });

  it('keeps one bonus row when two devices pay it before either syncs', async () => {
    const remote = new FakeRemote();
    const device = () => {
      const db = newDb();
      const engine = createSyncEngine({
        db,
        remote,
        clock: createTestClock(NOW),
        lock: null,
        appVersion: '0.2.0',
      });
      return { db, engine };
    };
    const a = device();
    const b = device();

    await reconcile(a.db, USER, easy, NOW);
    await reconcile(b.db, USER, easy, NOW);
    await a.engine.syncNow();
    await b.engine.syncNow();
    await a.engine.syncNow();

    expect(remote.tables.ledger.size).toBe(1);
    expect(await readBalance(a.db)).toBe(25);
    expect(await readBalance(b.db)).toBe(25);
  });
});

describe('the daily goal setting', () => {
  it('stores the goal clamped, and stamps the synced settings forward', async () => {
    const db = newDb();
    await setDailyGoal(db, 9000, NOW);
    expect(await readDailyGoal(db)).toBe(1440);
    expect(await readMeta<number>(db, META_KEYS.dailyGoalMin)).toBe(1440);
    expect(await readMeta<number>(db, META_KEYS.settingsUpdatedAt)).toBe(NOW);

    await setDailyGoal(db, 1, NOW);
    expect(await readDailyGoal(db)).toBe(5);
    // Two edits in one millisecond still read as two.
    expect(await readMeta<number>(db, META_KEYS.settingsUpdatedAt)).toBe(NOW + 1);
  });

  it('falls back to 60 minutes when nothing, or nonsense, is stored', async () => {
    const db = newDb();
    expect(await readDailyGoal(db)).toBe(60);
    await db.meta.put({ key: META_KEYS.dailyGoalMin, value: 'soon' });
    expect(await readDailyGoal(db)).toBe(60);
  });
});
