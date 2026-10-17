import { liveQuery } from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createDb,
  META_KEYS,
  readMeta,
  writeMeta,
  type ConstellationRow,
  type LedgerRow,
  type SessionRow,
  type TagRow,
  type WorkTimerDb,
} from '../db';
import { createTestClock, stableId } from '../lib';
import { countPending, createSyncEngine, PULL_PAGE, type SyncLock } from './engine';
import { FakeRemote } from './fakeRemote';
import { sessionToWire, settingsToWire, tagToWire } from './wire';

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

const device = (remote: FakeRemote, lock: SyncLock | null = null, appVersion = '0.1.0') => {
  const db = newDb();
  const engine = createSyncEngine({
    db,
    remote,
    clock: createTestClock(T0 + 3_600_000),
    lock,
    appVersion,
  });
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

// --- settings (M5 PR 3) ------------------------------------------------------

const POMO = { focusS: 1500, shortBreakS: 300, longBreakS: 900, blocksPerLongBreak: 4 };

/** Write settings the way `saveTimerPrefs` does after a local edit. */
const editSettings = async (
  db: WorkTimerDb,
  updatedAt: number,
  mode: 'countdown' | 'pomodoro' = 'pomodoro',
  settings = POMO,
) => {
  await writeMeta(db, META_KEYS.timerMode, mode);
  await writeMeta(db, META_KEYS.pomodoroSettings, settings);
  await writeMeta(db, META_KEYS.settingsUpdatedAt, updatedAt);
};

const NO_M6 = { starStyle: null, skyTheme: null, dailyGoalMin: null };

const serverSettings = (updatedAt: number, focusS = 1800) =>
  settingsToWire({ mode: 'pomodoro', settings: { ...POMO, focusS }, ...NO_M6, updatedAt });

describe('settings', () => {
  // U1
  it('uploads a local settings change once and marks it synced', async () => {
    const remote = new FakeRemote();
    const { db, engine } = device(remote);
    await editSettings(db, T0);

    const first = await engine.syncNow();
    const pushesAfterFirst = remote.pushCalls;
    await engine.syncNow();

    expect(first).toMatchObject({ ok: true, counts: { pushed: 1 } });
    expect(remote.tables.user_settings.get('me')).toMatchObject({
      mode: 'pomodoro',
      pomodoro: { focus_s: 1500, short_break_s: 300, long_break_s: 900, blocks_per_long_break: 4 },
    });
    expect(await readMeta(db, META_KEYS.settingsSyncedAt)).toBe(T0);
    expect(remote.pushCalls).toBe(pushesAfterFirst);
    expect(await countPending(db)).toEqual({ pending: 0, rejected: 0 });
  });

  // U2
  it('keeps settings edited during their upload waiting, and sends the edit next time', async () => {
    const remote = new FakeRemote();
    const { db, engine } = device(remote);
    await editSettings(db, T0);
    remote.onPush = async (table) => {
      if (table !== 'user_settings') return;
      remote.onPush = null;
      await editSettings(db, T0 + 1000, 'pomodoro', { ...POMO, focusS: 2400 });
    };

    await engine.syncNow();
    expect(await countPending(db)).toMatchObject({ pending: 1 });

    await engine.syncNow();
    expect(remote.tables.user_settings.get('me')).toMatchObject({ pomodoro: { focus_s: 2400 } });
    expect(await readMeta(db, META_KEYS.settingsSyncedAt)).toBe(T0 + 1000);
  });

  // U3
  it('adopts newer settings from the server, leaving the tag and a run in progress alone', async () => {
    const remote = new FakeRemote();
    const { db, engine } = device(remote);
    await editSettings(db, T0, 'countdown');
    await writeMeta(db, META_KEYS.settingsSyncedAt, T0);
    await writeMeta(db, META_KEYS.lastTagId, 'my-tag');
    const run = { id: 'run', startedAt: T0, settings: POMO, blocksDone: 1, break: null };
    await writeMeta(db, META_KEYS.activeRun, run);
    remote.seed('user_settings', serverSettings(T0 + 5000, 1800));

    const outcome = await engine.syncNow();

    expect(outcome).toMatchObject({ ok: true, counts: { pulled: 1 } });
    expect(await readMeta(db, META_KEYS.timerMode)).toBe('pomodoro');
    expect(await readMeta(db, META_KEYS.pomodoroSettings)).toEqual({ ...POMO, focusS: 1800 });
    expect(await readMeta(db, META_KEYS.settingsUpdatedAt)).toBe(T0 + 5000);
    expect(await readMeta(db, META_KEYS.lastTagId)).toBe('my-tag');
    expect(await readMeta(db, META_KEYS.activeRun)).toEqual(run);
    expect(await countPending(db)).toMatchObject({ pending: 0 });
  });

  // U4
  it('keeps a newer local edit over older server settings, and uploads it', async () => {
    const remote = new FakeRemote();
    const { db, engine } = device(remote);
    remote.seed('user_settings', serverSettings(T0, 1800));
    await editSettings(db, T0 + 5000, 'pomodoro', { ...POMO, focusS: 600 });

    await engine.syncNow();

    expect(await readMeta(db, META_KEYS.pomodoroSettings)).toEqual({ ...POMO, focusS: 600 });
    expect(remote.tables.user_settings.get('me')).toMatchObject({ pomodoro: { focus_s: 600 } });
    expect(await readMeta(db, META_KEYS.settingsSyncedAt)).toBe(T0 + 5000);
  });

  // U5
  it.each([
    ['an unknown mode', { ...serverSettings(T0 + 5000), mode: 'flowtime' }],
    [
      'a fractional length',
      {
        ...serverSettings(T0 + 5000),
        pomodoro: { focus_s: 1.5, short_break_s: 300, long_break_s: 900, blocks_per_long_break: 4 },
      },
    ],
  ])('skips and counts settings with %s, and applies the rest', async (_label, row) => {
    const remote = new FakeRemote();
    const { db, engine } = device(remote);
    await editSettings(db, T0, 'countdown');
    await writeMeta(db, META_KEYS.settingsSyncedAt, T0);
    remote.seed('user_settings', row);
    const s = session();
    remote.seed('sessions', sessionToWire(s));

    const outcome = await engine.syncNow();

    expect(outcome).toMatchObject({ ok: true, counts: { skipped: 1 } });
    expect(await readMeta(db, META_KEYS.timerMode)).toBe('countdown');
    expect(await db.sessions.get(s.id)).toBeDefined();
  });

  // U6
  it('a device with no settings of its own adopts the account’s and uploads nothing', async () => {
    const remote = new FakeRemote();
    const { db, engine } = device(remote);
    remote.seed('user_settings', serverSettings(T0, 1800));

    await engine.syncNow();

    expect(remote.pushCalls).toBe(0);
    expect(await readMeta(db, META_KEYS.pomodoroSettings)).toEqual({ ...POMO, focusS: 1800 });
    expect(await countPending(db)).toMatchObject({ pending: 0 });
  });

  // The status line and the 2 s upload both hang off a live query of this
  // count. A version that awaited nested async helpers stopped re-running
  // after its first result, so a finished session never went up on its own.
  it('the pending count keeps updating inside a live query', async () => {
    const remote = new FakeRemote();
    const { db } = device(remote);
    await editSettings(db, T0);
    const seen: number[] = [];
    const sub = liveQuery(() => countPending(db)).subscribe((c) => seen.push(c.pending));
    const settle = () => new Promise((r) => setTimeout(r, 100));

    await settle();
    await db.sessions.add(session());
    await settle();
    await writeMeta(db, META_KEYS.settingsSyncedAt, T0);
    await settle();
    sub.unsubscribe();

    expect(seen).toEqual([1, 2, 1]);
  });

  it('sets aside settings the server refuses until they are edited again', async () => {
    const remote = new FakeRemote();
    const { db, engine } = device(remote);
    remote.reject.add('me');
    await editSettings(db, T0);

    await engine.syncNow();
    expect(await countPending(db)).toEqual({ pending: 0, rejected: 1 });

    remote.reject.clear();
    await editSettings(db, T0 + 1000);
    expect(await countPending(db)).toMatchObject({ pending: 1 });
    await engine.syncNow();
    expect(await readMeta(db, META_KEYS.settingsSyncedAt)).toBe(T0 + 1000);
  });
});

// --- version check (M5 PR 3) ---------------------------------------------------

describe('minimum app version', () => {
  // U8
  it('syncs nothing when the server requires a newer app', async () => {
    const remote = new FakeRemote();
    remote.minVersion = '0.2.0';
    const { db, engine } = device(remote);
    await db.sessions.add(session());
    remote.seed('sessions', sessionToWire(session()));

    expect(await engine.syncNow()).toEqual({ ok: false, reason: 'outdated' });
    expect(remote.pushCalls).toBe(0);
    expect(remote.pullCalls).toBe(0);
    expect(await db.sessions.count()).toBe(1);
  });

  it.each([null, '0.1.0', '0.0.9', 'not-a-version'])(
    'syncs normally when the minimum is %s',
    async (min) => {
      const remote = new FakeRemote();
      remote.minVersion = min;
      const { db, engine } = device(remote);
      await db.sessions.add(session());

      expect(await engine.syncNow()).toMatchObject({ ok: true, counts: { pushed: 1 } });
    },
  );

  it('resumes once the minimum is lowered again', async () => {
    const remote = new FakeRemote();
    remote.minVersion = '9.0.0';
    const { db, engine } = device(remote);
    await db.sessions.add(session());
    await engine.syncNow();

    remote.minVersion = null;

    expect(await engine.syncNow()).toMatchObject({ ok: true, counts: { pushed: 1 } });
    expect(remote.tables.sessions.size).toBe(1);
  });
});

// --- Stardust ledger and M6 settings ---------------------------------------------

const earning = (o: Partial<LedgerRow> = {}): LedgerRow => ({
  id: stableId(`u1:session:${crypto.randomUUID()}`),
  reason: 'session',
  delta: 25,
  ref: 's-1',
  createdAt: T0,
  syncedAt: null,
  ...o,
});

describe('ledger', () => {
  it('uploads Stardust rows and marks them synced', async () => {
    const remote = new FakeRemote();
    const { db, engine } = device(remote);
    const row = earning();
    await db.ledger.add(row);

    expect(await countPending(db)).toMatchObject({ pending: 1 });
    expect(await engine.syncNow()).toMatchObject({ ok: true, counts: { pushed: 1 } });

    expect(remote.tables.ledger.get(row.id)).toMatchObject({ reason: 'session', delta: 25 });
    expect((await db.ledger.get(row.id))?.syncedAt).not.toBeNull();
    expect(await countPending(db)).toMatchObject({ pending: 0 });
  });

  // M6 case 2: the same fact recorded on two devices is one row everywhere.
  it('keeps one row when two devices record the same fact', async () => {
    const remote = new FakeRemote();
    const a = device(remote);
    const b = device(remote);
    const id = stableId('u1:session:shared');
    await a.db.ledger.add(earning({ id, createdAt: T0 }));
    await b.db.ledger.add(earning({ id, createdAt: T0 + 5_000 }));

    await a.engine.syncNow();
    await b.engine.syncNow();
    await a.engine.syncNow();

    expect(remote.tables.ledger.size).toBe(1);
    for (const { db } of [a, b]) {
      expect(await db.ledger.count()).toBe(1);
      expect((await db.ledger.get(id))?.syncedAt).not.toBeNull();
      const sum = (await db.ledger.toArray()).reduce((n, r) => n + r.delta, 0);
      expect(sum).toBe(25);
    }
  });

  it('downloads Stardust recorded on another device', async () => {
    const remote = new FakeRemote();
    const { db, engine } = device(remote);
    const row = earning({ delta: 40 });
    remote.seed('ledger', {
      id: row.id,
      reason: 'session',
      delta: 40,
      ref: 's-9',
      created_at: new Date(T0).toISOString(),
    });

    await engine.syncNow();

    expect(await db.ledger.get(row.id)).toMatchObject({ reason: 'session', delta: 40, ref: 's-9' });
  });

  it('skips and counts a ledger row it cannot represent, and applies the rest', async () => {
    const remote = new FakeRemote();
    const { db, engine } = device(remote);
    remote.seed('ledger', {
      id: stableId('bad'),
      reason: 'session',
      delta: 2.5,
      ref: null,
      created_at: new Date(T0).toISOString(),
    });
    remote.seed('ledger', {
      id: stableId('good'),
      reason: 'session',
      delta: 3,
      ref: null,
      created_at: new Date(T0).toISOString(),
    });

    const outcome = await engine.syncNow();

    expect(outcome).toMatchObject({ ok: true, counts: { skipped: 1, pulled: 1 } });
    expect(await db.ledger.get(stableId('good'))).toBeDefined();
  });
});

describe('M6 settings', () => {
  const setM6 = async (db: WorkTimerDb, at: number, style: string, theme: string, goal: number) => {
    await writeMeta(db, META_KEYS.starStyle, style);
    await writeMeta(db, META_KEYS.skyTheme, theme);
    await writeMeta(db, META_KEYS.dailyGoalMin, goal);
    await writeMeta(db, META_KEYS.settingsUpdatedAt, at);
  };

  // M6 case 13
  it('carries the star style, sky theme and daily goal to the other device', async () => {
    const remote = new FakeRemote();
    const a = device(remote);
    const b = device(remote);
    await editSettings(a.db, T0);
    await setM6(a.db, T0 + 1, 'style-rose', 'theme-dusk', 90);

    await a.engine.syncNow();
    await b.engine.syncNow();

    expect(remote.tables.user_settings.get('me')).toMatchObject({
      star_style: 'style-rose',
      sky_theme: 'theme-dusk',
      daily_goal_min: 90,
    });
    expect(await readMeta(b.db, META_KEYS.starStyle)).toBe('style-rose');
    expect(await readMeta(b.db, META_KEYS.skyTheme)).toBe('theme-dusk');
    expect(await readMeta(b.db, META_KEYS.dailyGoalMin)).toBe(90);
  });

  it('picks them up after updating from an app that wrote the same version without them', async () => {
    // Before updating, this device ran 0.1.x: it uploaded a Pomodoro edit as
    // version T0, and the server kept the style another device had chosen.
    const remote = new FakeRemote();
    const { db, engine } = device(remote);
    await editSettings(db, T0, 'pomodoro');
    await writeMeta(db, META_KEYS.settingsSyncedAt, T0);
    remote.seed('user_settings', {
      ...serverSettings(T0),
      star_style: 'style-rose',
      sky_theme: 'theme-dusk',
      daily_goal_min: 90,
    });

    await engine.syncNow();

    expect(await readMeta(db, META_KEYS.starStyle)).toBe('style-rose');
    expect(await readMeta(db, META_KEYS.skyTheme)).toBe('theme-dusk');
    expect(await readMeta(db, META_KEYS.dailyGoalMin)).toBe(90);
    expect(await readMeta(db, META_KEYS.settingsUpdatedAt)).toBe(T0);
  });

  it('a newer edit elsewhere that goes back to the defaults clears them here', async () => {
    const remote = new FakeRemote();
    const { db, engine } = device(remote);
    await editSettings(db, T0, 'pomodoro');
    await setM6(db, T0, 'style-rose', 'theme-dusk', 90);
    await writeMeta(db, META_KEYS.settingsSyncedAt, T0);
    remote.seed('user_settings', serverSettings(T0 + 5000)); // explicit nulls

    await engine.syncNow();

    expect(await readMeta(db, META_KEYS.starStyle)).toBeUndefined();
    expect(await readMeta(db, META_KEYS.skyTheme)).toBeUndefined();
    expect(await readMeta(db, META_KEYS.dailyGoalMin)).toBeUndefined();
  });

  it('a settings row without the M6 columns at all leaves this device’s values alone', async () => {
    const remote = new FakeRemote();
    const { db, engine } = device(remote);
    await editSettings(db, T0, 'countdown');
    await setM6(db, T0, 'style-rose', 'theme-dusk', 90);
    await writeMeta(db, META_KEYS.settingsSyncedAt, T0);
    // What a server without the M6 migration would send.
    const {
      star_style: _s,
      sky_theme: _t,
      daily_goal_min: _g,
      ...preM6
    } = serverSettings(T0 + 5000);
    remote.seed('user_settings', preM6);

    await engine.syncNow();

    expect(await readMeta(db, META_KEYS.timerMode)).toBe('pomodoro'); // the newer edit applies
    expect(await readMeta(db, META_KEYS.starStyle)).toBe('style-rose');
    expect(await readMeta(db, META_KEYS.skyTheme)).toBe('theme-dusk');
    expect(await readMeta(db, META_KEYS.dailyGoalMin)).toBe(90);
  });

  it('uploads a style chosen on a device that never saved Pomodoro lengths, with the defaults', async () => {
    const remote = new FakeRemote();
    const { db, engine } = device(remote);
    await writeMeta(db, META_KEYS.starStyle, 'style-rose');
    await writeMeta(db, META_KEYS.settingsUpdatedAt, T0);

    expect(await countPending(db)).toMatchObject({ pending: 1 });
    await engine.syncNow();

    expect(remote.tables.user_settings.get('me')).toMatchObject({
      mode: 'countdown',
      star_style: 'style-rose',
      pomodoro: { focus_s: 1500, short_break_s: 300, long_break_s: 900, blocks_per_long_break: 4 },
    });
  });
});
