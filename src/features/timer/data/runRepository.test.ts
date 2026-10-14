import { afterEach, describe, expect, it } from 'vitest';

import { createDb, META_KEYS, readMeta, writeMeta, type WorkTimerDb } from '@/shared/db';
import { createTestClock } from '@/shared/lib';

import { DEFAULT_POMODORO, DEV_POMODORO_LIMITS, POMODORO_LIMITS } from '../domain/pomodoro';
import type { PomodoroRun, SessionEnding } from '../domain/types';
import {
  endRun,
  loadActiveRun,
  NoActiveRunError,
  peekActiveRun,
  readTimerPrefs,
  saveTimerPrefs,
  setRunTag,
  skipBreak,
  startNextBlock,
} from './runRepository';
import {
  ActiveRunExistsError,
  ActiveSessionExistsError,
  finishSession,
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
const FOCUS_MS = DEFAULT_POMODORO.focusS * 1000;
const pomodoro = { mode: 'pomodoro' as const, settings: DEFAULT_POMODORO, tagId: null };
const ctx = (at = START) => ({ clock: createTestClock(at), device: 'desktop/app' });
const completed = (startedAt: number): SessionEnding => ({
  outcome: 'completed',
  endedAt: startedAt + FOCUS_MS,
  actualFocusS: DEFAULT_POMODORO.focusS,
});

describe('starting a run', () => {
  it('creates the run and its first block together', async () => {
    const db = withDb();

    const { session, run } = await startSession(db, pomodoro, ctx());

    expect(run).toMatchObject({ blocksDone: 0, break: null, settings: DEFAULT_POMODORO });
    expect(session).toMatchObject({ mode: 'pomodoro', runId: run!.id, runIndex: 1 });
    expect(await db.sessions.get(session.id)).toMatchObject({
      mode: 'pomodoro',
      runId: run!.id,
      runIndex: 1,
      plannedDurationS: DEFAULT_POMODORO.focusS,
    });
    expect(await peekActiveRun(db)).toEqual(run);
  });

  it('refuses a second run while one exists between blocks', async () => {
    const db = withDb();
    const { session } = await startSession(db, pomodoro, ctx());
    await finishSession(db, session.id, completed(START));

    await expect(startSession(db, pomodoro, ctx())).rejects.toBeInstanceOf(ActiveRunExistsError);
    expect(await db.sessions.count()).toBe(1);
  });
});

describe('finishing a block', () => {
  it("starts the break at the block's planned end", async () => {
    const db = withDb();
    const { session } = await startSession(db, pomodoro, ctx());

    const run = await finishSession(db, session.id, completed(START));

    expect(run).toMatchObject({
      blocksDone: 1,
      break: { kind: 'short', startedAt: START + FOCUS_MS, durationS: 300 },
    });
    expect(await peekActiveRun(db)).toEqual(run);
    expect(await readMeta(db, META_KEYS.activeSessionId)).toBeUndefined();
  });

  // O5.17
  it('moves the run on only once when finished twice', async () => {
    const db = withDb();
    const { session } = await startSession(db, pomodoro, ctx());

    const first = await finishSession(db, session.id, completed(START));
    const second = await finishSession(db, session.id, completed(START + 99_000));

    expect(second).toEqual(first);
    expect((await peekActiveRun(db))?.blocksDone).toBe(1);
  });

  // O4.11
  it('ending a block early keeps earlier blocks and ends the run', async () => {
    const db = withDb();
    const { session: b1, run } = await startSession(db, pomodoro, ctx());
    await finishSession(db, b1.id, completed(START));
    const { session: b2 } = await startNextBlock(db, run!.id, ctx(START + 2 * FOCUS_MS));

    const after = await finishSession(db, b2.id, {
      outcome: 'cancelled',
      endedAt: START + 2 * FOCUS_MS + 60_000,
      actualFocusS: 60,
    });

    expect(after).toBeNull();
    expect((await db.sessions.get(b1.id))?.outcome).toBe('completed');
    expect((await db.sessions.get(b2.id))?.outcome).toBe('cancelled');
    expect(await peekActiveRun(db)).toBeUndefined();
  });

  it('returns null for a countdown', async () => {
    const db = withDb();
    const { session } = await startSession(
      db,
      { mode: 'countdown', plannedDurationS: 60, tagId: null },
      ctx(),
    );

    expect(await finishSession(db, session.id, completed(START))).toBeNull();
  });
});

describe('between blocks', () => {
  const runOnBreak = async (db: WorkTimerDb): Promise<string> => {
    const { session, run } = await startSession(db, pomodoro, ctx());
    await finishSession(db, session.id, completed(START));
    return run!.id;
  };

  it('starts the next block with the next index and clears the break', async () => {
    const db = withDb();
    const runId = await runOnBreak(db);

    const { session, run } = await startNextBlock(db, runId, ctx(START + FOCUS_MS + 1));

    expect(session).toMatchObject({ runId, runIndex: 2 });
    expect(run).toMatchObject({ blocksDone: 1, break: null });
    expect(await readMeta(db, META_KEYS.activeSessionId)).toBe(session.id);
  });

  it('will not start a block while one is already in flight', async () => {
    const db = withDb();
    const runId = await runOnBreak(db);
    await startNextBlock(db, runId, ctx());

    await expect(startNextBlock(db, runId, ctx())).rejects.toBeInstanceOf(ActiveSessionExistsError);
    expect(await db.sessions.count()).toBe(2);
  });

  it('refuses a block for a run that does not exist', async () => {
    const db = withDb();
    await expect(startNextBlock(db, 'no-run', ctx())).rejects.toBeInstanceOf(NoActiveRunError);
    expect(await db.sessions.count()).toBe(0);
  });

  // O3.9
  it('skipping shortens the break to end now, and writes no session', async () => {
    const db = withDb();
    const runId = await runOnBreak(db);

    const run = await skipBreak(db, runId, START + FOCUS_MS + 42_500);

    expect(run.break?.durationS).toBe(42);
    expect(await db.sessions.count()).toBe(1);
  });

  it('skipping a break that is already over changes nothing', async () => {
    const db = withDb();
    const runId = await runOnBreak(db);
    const before = await peekActiveRun(db);

    expect(await skipBreak(db, runId, START + FOCUS_MS + 999_000)).toEqual(before);
  });

  // O4.12
  it('ending the run summarises it and writes no session', async () => {
    const db = withDb();
    const runId = await runOnBreak(db);
    const before = await db.sessions.toArray();

    const summary = await endRun(db, runId);

    expect(summary).toEqual({ blocks: 1, focusS: DEFAULT_POMODORO.focusS });
    expect(await peekActiveRun(db)).toBeUndefined();
    expect(await db.sessions.toArray()).toEqual(before);
    // Idempotent.
    expect(await endRun(db, runId)).toEqual(summary);
  });
});

describe('loadActiveRun', () => {
  const bare: PomodoroRun = {
    id: 'run-x',
    startedAt: START,
    settings: DEFAULT_POMODORO,
    blocksDone: 0,
    break: null,
  };

  it('clears a run that never got its first block', async () => {
    const db = withDb();
    await writeMeta(db, META_KEYS.activeRun, bare);

    expect(await loadActiveRun(db)).toBeUndefined();
    expect(await peekActiveRun(db)).toBeUndefined();
  });

  it('keeps a run with earned blocks even with no break recorded', async () => {
    const db = withDb();
    const run = { ...bare, blocksDone: 2 };
    await writeMeta(db, META_KEYS.activeRun, run);

    expect(await loadActiveRun(db)).toEqual(run);
  });

  it('keeps a fresh run whose first block is in flight', async () => {
    const db = withDb();
    const { run } = await startSession(db, pomodoro, ctx());

    expect(await loadActiveRun(db)).toEqual(run);
  });
});

describe('timer prefs', () => {
  // O1.1, storage half
  it('round-trips the mode and settings', async () => {
    const db = withDb();
    const settings = { focusS: 1800, shortBreakS: 420, longBreakS: 1200, blocksPerLongBreak: 3 };

    await saveTimerPrefs(db, { mode: 'pomodoro', settings, tagId: null }, START);

    expect(await readTimerPrefs(db, POMODORO_LIMITS)).toEqual({
      mode: 'pomodoro',
      settings,
      tagId: null,
    });
  });

  it('defaults to countdown and clamps whatever was stored', async () => {
    const db = withDb();
    await writeMeta(db, META_KEYS.timerMode, 'nonsense');
    await writeMeta(db, META_KEYS.pomodoroSettings, { focusS: 60 });

    expect(await readTimerPrefs(db, POMODORO_LIMITS)).toEqual({
      mode: 'countdown',
      settings: { ...DEFAULT_POMODORO, focusS: 300 },
      tagId: null,
    });
    expect((await readTimerPrefs(db, DEV_POMODORO_LIMITS)).settings.focusS).toBe(60);
  });

  // M5 U7: only what syncs between devices stamps the sync clock.
  it('stamps settingsUpdatedAt for a mode or length change, never for a tag change', async () => {
    const db = withDb();
    const base = { mode: 'countdown' as const, settings: DEFAULT_POMODORO, tagId: null };
    const stamp = () => readMeta<number>(db, META_KEYS.settingsUpdatedAt);

    await saveTimerPrefs(db, base, START);
    expect(await stamp()).toBe(START);

    await saveTimerPrefs(db, { ...base, tagId: 't1' }, START + 1000);
    await saveTimerPrefs(db, base, START + 2000);
    expect(await stamp()).toBe(START);

    await saveTimerPrefs(db, { ...base, mode: 'pomodoro' }, START + 3000);
    expect(await stamp()).toBe(START + 3000);

    const longer = { ...DEFAULT_POMODORO, focusS: DEFAULT_POMODORO.focusS + 300 };
    await saveTimerPrefs(db, { ...base, mode: 'pomodoro', settings: longer }, START + 3000);
    expect(await stamp()).toBe(START + 3001);
  });
});

describe('tags on a run', () => {
  const tagged = (tagId: string | null) => ({ ...pomodoro, tagId });

  // M4 case 9
  it('the next block takes the run tag, and a run from before M4 yields none', async () => {
    const db = withDb();
    const { session, run } = await startSession(db, tagged('writing'), ctx());
    await finishSession(db, session.id, completed(START));

    const next = await startNextBlock(db, run!.id, ctx(START + FOCUS_MS));
    expect(next.session.tagId).toBe('writing');
    expect((await db.sessions.get(next.session.id))?.tagId).toBe('writing');

    // A run row written by M3 has no tagId field at all.
    const legacy = withDb();
    const started = await startSession(legacy, pomodoro, ctx());
    const { tagId: _omit, ...withoutTag } = (await peekActiveRun(legacy))!;
    await writeMeta(legacy, META_KEYS.activeRun, withoutTag);
    await finishSession(legacy, started.session.id, completed(START));
    const block2 = await startNextBlock(legacy, started.run!.id, ctx(START + FOCUS_MS));
    expect(block2.session.tagId).toBeNull();
  });

  // M4 case 8, the data half: a change during a break outlives a reload.
  it('a tag set during a break is what the next block gets', async () => {
    const db = withDb();
    const { session, run } = await startSession(db, tagged('writing'), ctx());
    await finishSession(db, session.id, completed(START));

    await setRunTag(db, run!.id, 'reading');

    expect((await peekActiveRun(db))?.tagId).toBe('reading');
    const next = await startNextBlock(db, run!.id, ctx(START + FOCUS_MS));
    expect(next.session.tagId).toBe('reading');
    expect((await db.sessions.get(session.id))?.tagId).toBe('writing');
  });

  it('changing the tag mid-block moves the block and the run together', async () => {
    const db = withDb();
    const { session } = await startSession(db, tagged('writing'), ctx());

    expect(await setInFlightTag(db, session.id, 'reading')).toBe(true);

    expect((await db.sessions.get(session.id))?.tagId).toBe('reading');
    expect((await peekActiveRun(db))?.tagId).toBe('reading');
  });

  it('a prefs read drops a last tag that is archived or missing', async () => {
    const db = withDb();
    const base = { mode: 'countdown' as const, settings: DEFAULT_POMODORO };
    const tag = {
      id: 't1',
      name: 'Writing',
      color: 'mint' as const,
      createdAt: 1,
      updatedAt: 1,
      archivedAt: null,
      syncedAt: null,
    };
    await db.tags.add(tag);
    await saveTimerPrefs(db, { ...base, tagId: 't1' }, START);
    expect((await readTimerPrefs(db, POMODORO_LIMITS)).tagId).toBe('t1');

    await db.tags.update('t1', { archivedAt: 2 });
    expect((await readTimerPrefs(db, POMODORO_LIMITS)).tagId).toBeNull();

    await saveTimerPrefs(db, { ...base, tagId: 'gone' }, START);
    expect((await readTimerPrefs(db, POMODORO_LIMITS)).tagId).toBeNull();
  });
});
