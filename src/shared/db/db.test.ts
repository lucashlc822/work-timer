import { afterEach, describe, expect, it } from 'vitest';

import { createDb, type SessionRow, type WorkTimerDb } from './schema';
import { getLocalUserId, readMeta, writeMeta } from './meta';

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
  it('opens at version 1', async () => {
    const db = withDb();
    await db.open();
    expect(db.verno).toBe(1);
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
