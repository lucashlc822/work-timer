import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';

import { createDb, type SessionRow, type WorkTimerDb } from './schema';
import { getLocalUserId, hasWorkInFlight, readMeta, writeMeta } from './meta';
import { META_KEYS } from './schema';

const openFreshDb = (): WorkTimerDb => createDb(`test-${crypto.randomUUID()}`);

const opened: WorkTimerDb[] = [];
const withDb = (): WorkTimerDb => {
  const db = openFreshDb();
  opened.push(db);
  return db;
};

afterEach(async () => {
  while (opened.length > 0) {
    const db = opened.pop();
    await db?.delete();
  }
});

const aSession = (overrides: Partial<SessionRow> = {}): SessionRow => ({
  id: crypto.randomUUID(),
  mode: 'countdown',
  plannedDurationS: 1500,
  actualFocusS: 1500,
  startedAt: 1_700_000_000_000,
  endedAt: 1_700_000_001_500,
  outcome: 'completed',
  awayMs: 0,
  tagId: null,
  seed: 'abcdef0123456789',
  device: 'desktop/app',
  clientCreatedAt: 1_700_000_000_000,
  syncedAt: null,
  ...overrides,
});

describe('schema', () => {
  it('opens at version 4', async () => {
    const db = withDb();
    await db.open();
    expect(db.verno).toBe(4);
  });

  // M2 O8.18 — an M1 install upgrades without losing anything.
  it('upgrades a version 1 database without touching its rows', async () => {
    const name = `test-${crypto.randomUUID()}`;
    const v1 = new Dexie(name);
    v1.version(1).stores({ sessions: 'id, startedAt, tagId, syncedAt', meta: 'key' });
    const existing = aSession();
    await v1.table('sessions').add(existing);
    await v1.table('meta').put({ key: 'localUserId', value: 'user-1' });
    v1.close();

    const upgraded = createDb(name);
    opened.push(upgraded);
    await upgraded.open();

    expect(upgraded.verno).toBe(4);
    expect(await upgraded.sessions.toArray()).toEqual([existing]);
    expect(await readMeta(upgraded, 'localUserId')).toBe('user-1');
    expect(await upgraded.constellations.count()).toBe(0);
    expect(await upgraded.tags.count()).toBe(0);
    expect(await upgraded.ledger.count()).toBe(0);
  });

  // M4 case 26 — an M2/M3 install upgrades to tags without losing anything.
  it('upgrades a version 2 database without touching its rows', async () => {
    const name = `test-${crypto.randomUUID()}`;
    const v2 = new Dexie(name);
    v2.version(1).stores({ sessions: 'id, startedAt, tagId, syncedAt', meta: 'key' });
    v2.version(2).stores({ constellations: 'id, chosenAt, syncedAt' });
    const existing = aSession();
    const choice = {
      id: 'c1',
      source: 'catalogue',
      shapeId: 'kite',
      seed: null,
      tier: 'easy',
      chosenAt: 1_700_000_000_000,
      clientCreatedAt: 1_700_000_000_000,
      syncedAt: null,
    };
    await v2.table('sessions').add(existing);
    await v2.table('constellations').add(choice);
    v2.close();

    const upgraded = createDb(name);
    opened.push(upgraded);
    await upgraded.open();

    expect(upgraded.verno).toBe(4);
    expect(await upgraded.sessions.toArray()).toEqual([existing]);
    expect(await upgraded.constellations.toArray()).toEqual([choice]);
    expect(await upgraded.tags.count()).toBe(0);
  });

  // M6 — an M4/M5 install (every released app so far) gains the ledger,
  // keeps everything, and its finished sessions are not rewritten.
  it('upgrades a version 3 database without touching its rows', async () => {
    const name = `test-${crypto.randomUUID()}`;
    const v3 = new Dexie(name);
    v3.version(1).stores({ sessions: 'id, startedAt, tagId, syncedAt', meta: 'key' });
    v3.version(2).stores({ constellations: 'id, chosenAt, syncedAt' });
    v3.version(3).stores({ tags: 'id, createdAt, syncedAt' });
    const existing = aSession();
    const tag = {
      id: 't1',
      name: 'Writing',
      color: 'mint',
      createdAt: 1,
      updatedAt: 1,
      archivedAt: null,
      syncedAt: 5,
    };
    await v3.table('sessions').add(existing);
    await v3.table('tags').add(tag);
    await v3.table('meta').put({ key: 'timerMode', value: 'pomodoro' });
    await v3.table('meta').put({
      key: 'syncCursors',
      value: { sessions: '2026-10-01T00:00:00Z', user_settings: '2026-10-02T00:00:00Z' },
    });
    v3.close();

    const upgraded = createDb(name);
    opened.push(upgraded);
    await upgraded.open();

    expect(upgraded.verno).toBe(4);
    expect(await upgraded.sessions.toArray()).toEqual([existing]);
    expect(await upgraded.tags.toArray()).toEqual([tag]);
    expect(await readMeta(upgraded, 'timerMode')).toBe('pomodoro');
    expect(await upgraded.ledger.count()).toBe(0);
    // Settings are re-read in full once, so the M6 columns a pre-M6 app
    // skipped past arrive; every other table keeps its place.
    expect(await readMeta(upgraded, 'syncCursors')).toEqual({ sessions: '2026-10-01T00:00:00Z' });
  });

  it('round-trips a session without losing fields', async () => {
    const db = withDb();
    const session = aSession();

    await db.sessions.add(session);

    expect(await db.sessions.get(session.id)).toEqual(session);
  });

  it('rejects a duplicate id, which is what makes sync replay idempotent', async () => {
    const db = withDb();
    const session = aSession();

    await db.sessions.add(session);

    await expect(db.sessions.add(session)).rejects.toThrow();
  });

  it('finds unsynced sessions via the syncedAt index', async () => {
    const db = withDb();
    const unsynced = aSession({ syncedAt: null });
    const synced = aSession({ syncedAt: 1_700_000_002_000 });

    await db.sessions.bulkAdd([unsynced, synced]);

    // IndexedDB will not index null, so unsynced rows are absent from the
    // index entirely — the outbox finds them by difference, not by equality.
    const indexed = await db.sessions.orderBy('syncedAt').primaryKeys();
    expect(indexed).toEqual([synced.id]);
  });

  it('returns sessions in chronological order', async () => {
    const db = withDb();
    const older = aSession({ startedAt: 1_000 });
    const newer = aSession({ startedAt: 2_000 });

    await db.sessions.bulkAdd([newer, older]);

    const ordered = await db.sessions.orderBy('startedAt').toArray();
    expect(ordered.map((s) => s.id)).toEqual([older.id, newer.id]);
  });
});

describe('meta', () => {
  it('round-trips a typed value', async () => {
    const db = withDb();

    await writeMeta(db, 'greeting', { hello: 'world' });

    expect(await readMeta<{ hello: string }>(db, 'greeting')).toEqual({ hello: 'world' });
  });

  it('returns undefined for a missing key rather than throwing', async () => {
    const db = withDb();
    expect(await readMeta(db, 'absent')).toBeUndefined();
  });

  it('creates a local user id once and reuses it', async () => {
    const db = withDb();

    const first = await getLocalUserId(db);
    const second = await getLocalUserId(db);

    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('hasWorkInFlight', () => {
  it('is false on a fresh store', async () => {
    expect(await hasWorkInFlight(withDb())).toBe(false);
  });

  it('is true while a session is running', async () => {
    const db = withDb();
    await writeMeta(db, META_KEYS.activeSessionId, 'running');

    expect(await hasWorkInFlight(db)).toBe(true);
  });

  // A break between blocks has no session, only the run, and is still "in progress".
  it('is true during a Pomodoro run with no block in flight', async () => {
    const db = withDb();
    await writeMeta(db, META_KEYS.activeRun, { id: 'run', break: { kind: 'short' } });

    expect(await hasWorkInFlight(db)).toBe(true);
  });

  it('is false again once both pointers are gone', async () => {
    const db = withDb();
    await writeMeta(db, META_KEYS.activeSessionId, 'running');
    await db.meta.delete(META_KEYS.activeSessionId);

    expect(await hasWorkInFlight(db)).toBe(false);
  });
});
