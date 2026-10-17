import { afterEach, describe, expect, it } from 'vitest';

import { createDb, type SessionRow, type WorkTimerDb } from '@/shared/db';
import { createTestClock } from '@/shared/lib';
import { createSyncEngine } from '@/shared/sync';
import { FakeRemote } from '@/shared/sync/fakeRemote';
import { sessionToWire } from '@/shared/sync/wire';

import { readBalance, reconcile, sumDeltas } from './ledgerRepository';

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
const USER = '11111111-1111-4111-8111-111111111111';

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

const device = (remote: FakeRemote) => {
  const db = newDb();
  const engine = createSyncEngine({
    db,
    remote,
    clock: createTestClock(T0 + 3_600_000),
    lock: null,
    appVersion: '0.2.0',
  });
  return { db, engine };
};

describe('reconcile', () => {
  it('credits a completed session once, and an early ending not at all (case 1)', async () => {
    const db = newDb();
    await db.sessions.bulkAdd([session(), session({ outcome: 'cancelled', actualFocusS: 900 })]);

    expect(await reconcile(db, USER)).toBe(1);
    const rows = await db.ledger.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ reason: 'session', delta: 25 });
  });

  it('adds nothing the second time (case 2)', async () => {
    const db = newDb();
    await db.sessions.bulkAdd([session(), session({ actualFocusS: 600 })]);

    await reconcile(db, USER);
    expect(await reconcile(db, USER)).toBe(0);
    expect(await db.ledger.count()).toBe(2);
    expect(await readBalance(db)).toBe(35);
  });

  it('runs safely twice at once', async () => {
    const db = newDb();
    await db.sessions.add(session());
    await Promise.all([reconcile(db, USER), reconcile(db, USER)]);
    expect(await db.ledger.count()).toBe(1);
  });

  it('keeps one row per session across two devices syncing through the server (case 2)', async () => {
    const remote = new FakeRemote();
    const laptop = device(remote);
    const desktop = device(remote);
    await laptop.db.sessions.add(session());

    // The laptop credits the session, then uploads both.
    await reconcile(laptop.db, USER);
    await laptop.engine.syncNow();
    // The desktop pulls them, reconciles too, and syncs back.
    await desktop.engine.syncNow();
    await reconcile(desktop.db, USER);
    await desktop.engine.syncNow();
    await laptop.engine.syncNow();

    expect(remote.tables.ledger.size).toBe(1);
    for (const { db } of [laptop, desktop]) {
      const rows = await db.ledger.toArray();
      expect(rows).toHaveLength(1);
      expect(await readBalance(db)).toBe(sumDeltas(rows));
      expect(await readBalance(db)).toBe(25);
    }
  });

  it('keeps one row when both devices credit the same session before either syncs', async () => {
    const remote = new FakeRemote();
    const a = device(remote);
    const b = device(remote);
    const s = session();
    await a.db.sessions.add(s);
    await b.db.sessions.add({ ...s });

    await reconcile(a.db, USER);
    await reconcile(b.db, USER);
    await a.engine.syncNow();
    await b.engine.syncNow();
    await a.engine.syncNow();

    expect(remote.tables.ledger.size).toBe(1);
    expect(await a.db.ledger.count()).toBe(1);
    expect(await b.db.ledger.count()).toBe(1);
  });

  it('credits a session recorded by an app with no ledger exactly once (case 3)', async () => {
    const remote = new FakeRemote();
    // A 0.1.x app uploaded this session and never wrote a ledger row.
    const old = session({ actualFocusS: 50 * 60, endedAt: T0 + 3_000_000 });
    remote.seed('sessions', sessionToWire({ ...old, syncedAt: T0 }));
    const { db, engine } = device(remote);

    await engine.syncNow();
    expect(await reconcile(db, USER)).toBe(1);
    await engine.syncNow();
    await engine.syncNow();
    expect(await reconcile(db, USER)).toBe(0);

    expect(await readBalance(db)).toBe(50);
    expect(remote.tables.ledger.size).toBe(1);
  });
});
