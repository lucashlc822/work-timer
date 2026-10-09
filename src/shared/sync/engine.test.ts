import { afterEach, describe, expect, it } from 'vitest';

import {
  createDb,
  META_KEYS,
  readMeta,
  type ConstellationRow,
  type SessionRow,
  type TagRow,
  type WorkTimerDb,
} from '../db';
import { createTestClock } from '../lib';
import { createSyncEngine, PULL_PAGE, type SyncLock } from './engine';
import { FakeRemote } from './fakeRemote';
import { sessionToWire, tagToWire } from './wire';

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
  seed: 'seed-' + Math.random().toString(36).slice(2, 8),
  device: 'desktop/app',
  clientCreatedAt: T0,
  syncedAt: null,
  ...o,
});

const tag = (o: Partial<TagRow> = {}): TagRow => ({
  id: crypto.randomUUID(),
  name: 'Writing',
  color: 'mint',
  createdAt: T0,
  updatedAt: T0,
  archivedAt: null,
  syncedAt: null,
  ...o,
});

const choice = (o: Partial<ConstellationRow> = {}): ConstellationRow => ({
  id: crypto.randomUUID(),
  source: 'catalogue',
  shapeId: 'kite',
  seed: null,
  tier: 'easy',
  chosenAt: T0,
  clientCreatedAt: T0,
  syncedAt: null,
  ...o,
});

const device = (remote: FakeRemote, lock: SyncLock | null = null) => {
  const db = newDb();
  const engine = createSyncEngine({ db, remote, clock: createTestClock(T0 + 3_600_000), lock });
  return { db, engine };
};

describe('upload', () => {
  it('uploads finished sessions, tags and choices, and marks them synced', async () => {
    const remote = new FakeRemote();
    const { db, engine } = device(remote);
    const t = tag();
    await db.tags.add(t);
    await db.constellations.add(choice());
    await db.sessions.add(session({ tagId: t.id }));

    const outcome = await engine.syncNow();

    expect(outcome).toMatchObject({ ok: true, counts: { pushed: 3 } });
    expect(remote.tables.sessions.size).toBe(1);
    expect(remote.tables.tags.size).toBe(1);
    expect(remote.tables.constellations.size).toBe(1);
    expect((await db.sessions.toArray()).every((s) => s.syncedAt !== null)).toBe(true);
  });

  // Case 16: a session in progress is never uploaded.
  it('never uploads a session still in progress', async () => {
    const remote = new FakeRemote();
    const { db, engine } = device(remote);
    const live = session({ endedAt: null, outcome: null, actualFocusS: 0 });
    await db.sessions.add(live);

    await engine.syncNow();

    expect(remote.tables.sessions.size).toBe(0);
    expect((await db.sessions.get(live.id))?.syncedAt).toBeNull();
  });

  // Case 12: re-sending is harmless and leaves one copy.
  it('uploading the same rows again leaves exactly one copy', async () => {
    const remote = new FakeRemote();
    const { db, engine } = device(remote);
    const s = session();
    await db.sessions.add(s);
    await engine.syncNow();

    // Simulate a retry after a lost acknowledgement: the row is unsynced again.
    await db.sessions.update(s.id, { syncedAt: null });
    const again = await engine.syncNow();

    expect(again).toMatchObject({ ok: true });
    expect(remote.tables.sessions.size).toBe(1);
    expect((await db.sessions.get(s.id))?.syncedAt).not.toBeNull();
  });

  // Case 13: an edit that lands mid-upload is not lost.
  it('keeps a tag edited during its upload unsynced, and sends the edit next time', async () => {
    const remote = new FakeRemote();
    const { db, engine } = device(remote);
    const t = tag({ name: 'Writing' });
    await db.tags.add(t);
    remote.onPush = async (table) => {
      if (table !== 'tags') return;
      remote.onPush = null;
      await db.tags.update(t.id, { name: 'Essays', updatedAt: T0 + 5000, syncedAt: null });
    };

    await engine.syncNow();
    expect((await db.tags.get(t.id))?.syncedAt).toBeNull();
    expect(remote.tables.tags.get(t.id)?.name).toBe('Writing');

    await engine.syncNow();
    expect((await db.tags.get(t.id))?.syncedAt).not.toBeNull();
    expect(remote.tables.tags.get(t.id)?.name).toBe('Essays');
  });

  it('sets aside a row the server refuses, and still uploads the rest', async () => {
    const remote = new FakeRemote();
    const { db, engine } = device(remote);
    const good = session();
    const bad = session();
    await db.sessions.bulkAdd([good, bad]);
    remote.reject.add(bad.id);

    const first = await engine.syncNow();

    expect(first).toMatchObject({ ok: true, counts: { pushed: 1, rejected: 1 } });
    expect(remote.tables.sessions.has(good.id)).toBe(true);
    expect(await readMeta(db, META_KEYS.syncRejected)).toMatchObject({ sessions: [bad.id] });

    const pushesBefore = remote.pushCalls;
    await engine.syncNow();
    expect(remote.pushCalls).toBe(pushesBefore); // the refused row isn't retried
  });

  it('keeps a "not yet valid" session queued instead of setting it aside', async () => {
    const remote = new FakeRemote();
    const { db, engine } = device(remote);
    const early = session();
    const other = session();
    await db.sessions.bulkAdd([early, other]);
    remote.retryLater.add(early.id);

    const outcome = await engine.syncNow();

    // The early session waits; it doesn't hold back the one beside it.
    expect(outcome).toMatchObject({ ok: true, counts: { pushed: 1, rejected: 0 } });
    expect(remote.tables.sessions.has(other.id)).toBe(true);
    expect((await db.sessions.get(early.id))?.syncedAt).toBeNull();

    remote.retryLater.clear();
    await engine.syncNow();
    expect(remote.tables.sessions.has(early.id)).toBe(true);
  });

  it('marks nothing when the network is down, and reports it', async () => {
    const remote = new FakeRemote();
    const { db, engine } = device(remote);
    await db.sessions.add(session());
    remote.offline = true;

    expect(await engine.syncNow()).toMatchObject({ ok: false, reason: 'network' });
    expect((await db.sessions.toArray())[0]?.syncedAt).toBeNull();
    expect(await readMeta(db, META_KEYS.lastSyncedAt)).toBeUndefined();
  });

  it('never syncs without a signed-in session', async () => {
    const remote = new FakeRemote();
    const { db, engine } = device(remote);
    await db.sessions.add(session());
    remote.signedIn = false;

    expect(await engine.syncNow()).toEqual({ ok: false, reason: 'signedOut' });
    expect(remote.pushCalls).toBe(0);
  });
});

describe('download', () => {
  // Case 14 (and the unit half of case 20): another device's rows arrive intact.
  it('adds sessions from another device exactly as they were uploaded', async () => {
    const remote = new FakeRemote();
    const a = device(remote);
    const b = device(remote);
    const t = tag();
    const s = session({ tagId: t.id, runId: crypto.randomUUID(), runIndex: 2, mode: 'pomodoro' });
    await a.db.tags.add(t);
    await a.db.sessions.add(s);
    await a.engine.syncNow();

    await b.engine.syncNow();

    const { syncedAt: _a, ...sent } = s;
    const { syncedAt: _b, ...received } = (await b.db.sessions.get(s.id))!;
    expect(received).toEqual(sent);
    expect((await b.db.tags.get(t.id))?.name).toBe(t.name);
  });

  it('never overwrites a session that already exists locally', async () => {
    const remote = new FakeRemote();
    const { db, engine } = device(remote);
    const s = session();
    remote.seed('sessions', sessionToWire({ ...s, actualFocusS: 60 }));
    await db.sessions.add({ ...s, syncedAt: 1 });

    await engine.syncNow();

    expect((await db.sessions.get(s.id))?.actualFocusS).toBe(1500);
  });

  it('takes a newer tag from the server, and keeps a newer local edit', async () => {
    const remote = new FakeRemote();
    const { db, engine } = device(remote);
    const older = tag({ name: 'Old', updatedAt: T0 });
    const newerHere = tag({ name: 'Local wins', updatedAt: T0 + 9000 });
    await db.tags.bulkAdd([{ ...older, syncedAt: 1 }, newerHere]);
    remote.seed('tags', tagToWire({ ...older, name: 'Server wins', updatedAt: T0 + 5000 }));
    remote.seed('tags', tagToWire({ ...newerHere, name: 'Stale', updatedAt: T0 + 1000 }));

    await engine.syncNow();

    expect((await db.tags.get(older.id))?.name).toBe('Server wins');
    expect((await db.tags.get(newerHere.id))?.name).toBe('Local wins');
    expect(remote.tables.tags.get(newerHere.id)?.name).toBe('Local wins');
  });

  it('re-reading the overlap window changes nothing', async () => {
    const remote = new FakeRemote();
    const { db, engine } = device(remote);
    remote.seed('sessions', sessionToWire(session()));
    remote.seed('tags', tagToWire(tag()));

    const first = await engine.syncNow();
    const snapshot = JSON.stringify(await db.sessions.toArray());
    const second = await engine.syncNow();

    expect(first).toMatchObject({ counts: { pulled: 2 } });
    expect(second).toMatchObject({ ok: true, counts: { pulled: 0, pushed: 0 } });
    expect(JSON.stringify(await db.sessions.toArray())).toBe(snapshot);
  });

  // Case 15: a row from a newer app version is skipped, the rest applies.
  it('skips and counts a row it cannot represent, and applies the rest', async () => {
    const remote = new FakeRemote();
    const { db, engine } = device(remote);
    const fine = session();
    remote.seed('sessions', { ...sessionToWire(session()), mode: 'meditation' });
    remote.seed('sessions', sessionToWire(fine));

    const outcome = await engine.syncNow();

    expect(outcome).toMatchObject({ ok: true, counts: { skipped: 1, pulled: 1 } });
    expect(await db.sessions.get(fine.id)).toBeDefined();
  });

  it('pages through more rows than one request returns', async () => {
    const remote = new FakeRemote();
    const { db, engine } = device(remote);
    for (let i = 0; i < PULL_PAGE + 25; i++) remote.seed('sessions', sessionToWire(session()));

    const outcome = await engine.syncNow();

    expect(outcome).toMatchObject({ ok: true, counts: { pulled: PULL_PAGE + 25 } });
    expect(await db.sessions.count()).toBe(PULL_PAGE + 25);
  });
});

describe('concurrency', () => {
  // Case 17: two triggers at once run one round.
  it('two syncNow calls at once share one round', async () => {
    const remote = new FakeRemote();
    const { db, engine } = device(remote);
    await db.sessions.add(session());

    const [a, b] = await Promise.all([engine.syncNow(), engine.syncNow()]);

    expect(a).toBe(b);
    expect(remote.hasSessionCalls).toBe(1);
    expect(remote.tables.sessions.size).toBe(1);
  });

  it('another window holding the lock means this one skips', async () => {
    const remote = new FakeRemote();
    const held: SyncLock = { run: () => Promise.resolve('busy' as const) };
    const { engine } = device(remote, held);

    expect(await engine.syncNow()).toEqual({ ok: false, reason: 'busy' });
    expect(remote.hasSessionCalls).toBe(0);
  });
});
