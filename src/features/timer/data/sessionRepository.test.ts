import { afterEach, describe, expect, it } from 'vitest';

import { createDb, META_KEYS, readMeta, writeMeta, type WorkTimerDb } from '@/shared/db';
import { createTestClock } from '@/shared/lib';

import {
  ActiveSessionExistsError,
  addAwayTime,
  finishSession,
  loadActiveSession,
  peekActiveSession,
  setInFlightTag,
  startSession,
} from './sessionRepository';

const opened: WorkTimerDb[] = [];
const withDb = (): WorkTimerDb => {
  const db = createDb(`test-${crypto.randomUUID()}`);
  opened.push(db);
  return db;
};

afterEach(async () => {
  while (opened.length > 0) await opened.pop()?.delete();
});

const START = 1_700_000_000_000;
const draft = { mode: 'countdown' as const, plannedDurationS: 1500, tagId: null };
const ctx = () => ({ clock: createTestClock(START), device: 'desktop/app' });

describe('startSession', () => {
  it('writes an in-flight row and points activeSessionId at it', async () => {
    const db = withDb();

    const { session } = await startSession(db, draft, ctx());

    expect(session.startedAt).toBe(START);
    expect(await readMeta(db, META_KEYS.activeSessionId)).toBe(session.id);
    const row = await db.sessions.get(session.id);
    expect(row).toMatchObject({
      mode: 'countdown',
      plannedDurationS: 1500,
      endedAt: null,
      outcome: null,
      awayMs: 0,
      device: 'desktop/app',
    });
    // O7.23: a countdown is not part of any run.
    expect(row).not.toHaveProperty('runId');
    expect(row).not.toHaveProperty('runIndex');
  });

  // O3.11
  it('rejects while another session is active, and writes no second row', async () => {
    const db = withDb();
    await startSession(db, draft, ctx());

    await expect(startSession(db, draft, ctx())).rejects.toBeInstanceOf(ActiveSessionExistsError);
    expect(await db.sessions.count()).toBe(1);
  });

  it('starts normally over a dangling pointer', async () => {
    const db = withDb();
    await writeMeta(db, META_KEYS.activeSessionId, 'no-such-session');

    const { session } = await startSession(db, draft, ctx());

    expect(await readMeta(db, META_KEYS.activeSessionId)).toBe(session.id);
  });
});

describe('finishSession', () => {
  it('writes the ending and clears the active pointer', async () => {
    const db = withDb();
    const { session } = await startSession(db, draft, ctx());

    await finishSession(db, session.id, {
      outcome: 'cancelled',
      endedAt: START + 61_000,
      actualFocusS: 61,
    });

    expect(await db.sessions.get(session.id)).toMatchObject({
      outcome: 'cancelled',
      endedAt: START + 61_000,
      actualFocusS: 61,
    });
    expect(await readMeta(db, META_KEYS.activeSessionId)).toBeUndefined();
  });

  // O3.10
  it('is a no-op the second time, leaving the row unchanged', async () => {
    const db = withDb();
    const { session } = await startSession(db, draft, ctx());
    const first = { outcome: 'completed' as const, endedAt: START + 1_500_000, actualFocusS: 1500 };

    await finishSession(db, session.id, first);
    const afterFirst = await db.sessions.get(session.id);

    await finishSession(db, session.id, {
      outcome: 'cancelled',
      endedAt: START + 9_000_000,
      actualFocusS: 3,
    });

    expect(await db.sessions.get(session.id)).toEqual(afterFirst);
    expect(await db.sessions.count()).toBe(1);
  });

  it('does not clear a pointer that belongs to a different session', async () => {
    const db = withDb();
    const { session: finished } = await startSession(db, draft, ctx());
    await finishSession(db, finished.id, { outcome: 'cancelled', endedAt: START, actualFocusS: 0 });
    const { session: current } = await startSession(db, draft, ctx());

    await finishSession(db, finished.id, { outcome: 'cancelled', endedAt: START, actualFocusS: 0 });

    expect(await readMeta(db, META_KEYS.activeSessionId)).toBe(current.id);
  });
});

describe('loading the active session', () => {
  it('returns the in-flight session', async () => {
    const db = withDb();
    const { session } = await startSession(db, draft, ctx());

    expect(await loadActiveSession(db)).toEqual(session);
    expect(await peekActiveSession(db)).toEqual(session);
  });

  it('treats a dangling pointer as nothing active and clears it', async () => {
    const db = withDb();
    await writeMeta(db, META_KEYS.activeSessionId, 'no-such-session');

    expect(await peekActiveSession(db)).toBeUndefined();
    // peek is read-only, so the pointer survives it...
    expect(await readMeta(db, META_KEYS.activeSessionId)).toBe('no-such-session');

    expect(await loadActiveSession(db)).toBeUndefined();
    // ...and load cleans it up.
    expect(await readMeta(db, META_KEYS.activeSessionId)).toBeUndefined();
  });
});

describe('addAwayTime', () => {
  it('accumulates away time on an in-flight session', async () => {
    const db = withDb();
    const { session } = await startSession(db, draft, ctx());

    await addAwayTime(db, session.id, 20_000);
    await addAwayTime(db, session.id, 10_000);

    expect((await db.sessions.get(session.id))?.awayMs).toBe(30_000);
  });

  it('never touches a finished session', async () => {
    const db = withDb();
    const { session } = await startSession(db, draft, ctx());
    await finishSession(db, session.id, {
      outcome: 'completed',
      endedAt: START + 1_500_000,
      actualFocusS: 1500,
    });

    await addAwayTime(db, session.id, 20_000);

    expect((await db.sessions.get(session.id))?.awayMs).toBe(0);
  });
});

// M7 phase 5
describe('a session for a shared constellation', () => {
  it('stores the shared constellation it is for, and the active session says so', async () => {
    const db = withDb();
    const { session } = await startSession(db, { ...draft, sharedId: 'sh-1' }, ctx());

    expect(session.sharedId).toBe('sh-1');
    expect((await db.sessions.get(session.id))?.sharedId).toBe('sh-1');
  });

  it('a session for one’s own sky has none at all', async () => {
    const db = withDb();
    const { session } = await startSession(db, { ...draft, sharedId: null }, ctx());

    expect(session.sharedId).toBeNull();
    expect(await db.sessions.get(session.id)).not.toHaveProperty('sharedId');
  });
});

describe('setInFlightTag', () => {
  it('changes the tag of a session in flight', async () => {
    const db = withDb();
    const { session } = await startSession(db, draft, ctx());

    expect(await setInFlightTag(db, session.id, 'writing')).toBe(true);

    expect((await db.sessions.get(session.id))?.tagId).toBe('writing');
  });

  // M4 case 7 — a tag freezes when the session ends.
  it('never touches a finished session', async () => {
    const db = withDb();
    const { session } = await startSession(db, { ...draft, tagId: 'writing' }, ctx());
    await finishSession(db, session.id, {
      outcome: 'completed',
      endedAt: START + 1_500_000,
      actualFocusS: 1500,
    });
    const before = await db.sessions.get(session.id);

    expect(await setInFlightTag(db, session.id, 'reading')).toBe(false);

    expect(await db.sessions.get(session.id)).toEqual(before);
  });
});

describe('startSession: focus together (M7)', () => {
  // M7 4b, case 2.1 — every member counts down to the room's shared end.
  it('starts at the room’s shared start and records the room', async () => {
    const db = withDb();
    const startsAt = START - 4_000; // the room started a few seconds ago, on the server

    const { session } = await startSession(
      db,
      { ...draft, together: { roomId: 'room-1', startsAt } },
      ctx(),
    );

    expect(session.startedAt).toBe(startsAt);
    expect(session.togetherId).toBe('room-1');
    const row = await db.sessions.get(session.id);
    expect(row).toMatchObject({
      startedAt: startsAt,
      togetherId: 'room-1',
      clientCreatedAt: START,
    });
    expect(await loadActiveSession(db)).toMatchObject({
      togetherId: 'room-1',
      startedAt: startsAt,
    });
  });

  it('a solo session records no room at all', async () => {
    const db = withDb();
    const { session } = await startSession(db, draft, ctx());

    expect(session.togetherId).toBeNull();
    expect(await db.sessions.get(session.id)).not.toHaveProperty('togetherId');
  });
});
