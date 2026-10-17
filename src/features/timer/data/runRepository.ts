import { clearMeta, META_KEYS, readMeta, touchSettings, writeMeta } from '@/shared/db';
import type { SessionMode, WorkTimerDb } from '@/shared/db';

import { clampPomodoroSettings, type PomodoroLimits } from '../domain/pomodoro';
import type { PomodoroRun, PomodoroSettings, RunSummary, StartedSession } from '../domain/types';
import {
  ActiveSessionExistsError,
  addInFlightSession,
  readInFlight,
  type StartContext,
} from './sessionRepository';

/**
 * Persistence for a Pomodoro run between its blocks (M3).
 *
 * The run itself is one `meta` row (`PomodoroRunRow`); its blocks are ordinary
 * sessions. Every write here shares a transaction with `sessions`, so the run
 * and the active-session pointer can never disagree after a crash.
 */

export class NoActiveRunError extends Error {
  constructor(runId: string) {
    super(`No Pomodoro run ${runId} is in progress.`);
    this.name = 'NoActiveRunError';
  }
}

const readRun = async (db: WorkTimerDb, runId: string): Promise<PomodoroRun> => {
  const run = await readMeta<PomodoroRun>(db, META_KEYS.activeRun);
  if (run?.id !== runId) throw new NoActiveRunError(runId);
  return run;
};

/** The run in flight, without writing anything. Safe inside a `liveQuery`. */
export const peekActiveRun = async (db: WorkTimerDb): Promise<PomodoroRun | undefined> =>
  readMeta<PomodoroRun>(db, META_KEYS.activeRun);

/**
 * Like `peekActiveRun`, but clears a run that never got going: no blocks, no
 * break and no block in flight can only be a crash between creating the run
 * and its first block. Any other run without a block in flight resumes as
 * "ready for the next block" — its earned stars are real.
 */
export const loadActiveRun = (db: WorkTimerDb): Promise<PomodoroRun | undefined> =>
  db.transaction('rw', db.sessions, db.meta, async () => {
    const run = await readMeta<PomodoroRun>(db, META_KEYS.activeRun);
    if (run === undefined) return undefined;

    if (run.blocksDone === 0 && run.break === null) {
      const active = await readInFlight(db);
      if (active?.runId !== run.id) {
        await clearMeta(db, META_KEYS.activeRun);
        return undefined;
      }
    }
    return run;
  });

/**
 * Start the run's next block. Clears the break (over or skipped) in the same
 * transaction that writes the block.
 */
export const startNextBlock = (
  db: WorkTimerDb,
  runId: string,
  ctx: StartContext,
): Promise<StartedSession> =>
  db.transaction('rw', db.sessions, db.meta, async () => {
    const active = await readInFlight(db);
    if (active !== undefined) throw new ActiveSessionExistsError(active.id);

    const run: PomodoroRun = { ...(await readRun(db, runId)), break: null };
    await writeMeta(db, META_KEYS.activeRun, run);
    const session = await addInFlightSession(
      db,
      {
        mode: 'pomodoro',
        plannedDurationS: run.settings.focusS,
        tagId: run.tagId ?? null,
        runId: run.id,
        runIndex: run.blocksDone + 1,
      },
      ctx,
    );
    return { session, run };
  });

/**
 * Change the run's tag between blocks, so the next block carries it. During a
 * block, `setInFlightTag` does this together with the block's own row.
 */
export const setRunTag = (
  db: WorkTimerDb,
  runId: string,
  tagId: string | null,
): Promise<PomodoroRun> =>
  db.transaction('rw', db.meta, async () => {
    const run: PomodoroRun = { ...(await readRun(db, runId)), tagId };
    await writeMeta(db, META_KEYS.activeRun, run);
    return run;
  });

/**
 * End the current break at `now` by shortening it, so "the break is over"
 * stays derived from timestamps rather than becoming a stored flag. Whole
 * seconds, rounded down, so the shortened break never ends after `now`.
 */
export const skipBreak = (db: WorkTimerDb, runId: string, now: number): Promise<PomodoroRun> =>
  db.transaction('rw', db.meta, async () => {
    const run = await readRun(db, runId);
    if (run.break === null) return run;

    const elapsedS = Math.max(0, Math.floor((now - run.break.startedAt) / 1000));
    if (elapsedS >= run.break.durationS) return run;

    const skipped: PomodoroRun = { ...run, break: { ...run.break, durationS: elapsedS } };
    await writeMeta(db, META_KEYS.activeRun, skipped);
    return skipped;
  });

/**
 * End the run between blocks and summarise it. Writes no session — nothing is
 * in flight. Idempotent: ending a run that is already gone still returns its
 * summary.
 *
 * The summary is a full scan of sessions (`runId` is unindexed). Fine at this
 * scale; M4 can add an index if stats need one.
 */
export const endRun = (db: WorkTimerDb, runId: string): Promise<RunSummary> =>
  db.transaction('rw', db.sessions, db.meta, async () => {
    const run = await readMeta<PomodoroRun>(db, META_KEYS.activeRun);
    if (run?.id === runId) await clearMeta(db, META_KEYS.activeRun);
    return summariseRun(db, runId);
  });

export const summariseRun = async (db: WorkTimerDb, runId: string): Promise<RunSummary> => {
  const blocks = await db.sessions
    .filter((row) => row.runId === runId && row.outcome === 'completed')
    .toArray();
  return { blocks: blocks.length, focusS: blocks.reduce((sum, row) => sum + row.actualFocusS, 0) };
};

export interface TimerPrefs {
  mode: SessionMode;
  settings: PomodoroSettings;
  /** The tag the idle screen preselects; null for none. */
  tagId: string | null;
}

/** Saved mode and Pomodoro lengths, clamped on the way out. */
export const readTimerPrefs = async (
  db: WorkTimerDb,
  limits: PomodoroLimits,
): Promise<TimerPrefs> => {
  const mode = await readMeta<unknown>(db, META_KEYS.timerMode);
  const settings = await readMeta<Partial<PomodoroSettings>>(db, META_KEYS.pomodoroSettings);
  const storedTag = await readMeta<unknown>(db, META_KEYS.lastTagId);
  // A tag that is gone or archived reads as "no tag" rather than lingering.
  const tag = typeof storedTag === 'string' ? await db.tags.get(storedTag) : undefined;
  return {
    mode: mode === 'pomodoro' ? 'pomodoro' : 'countdown',
    settings: clampPomodoroSettings(settings, limits),
    tagId: tag !== undefined && tag.archivedAt === null ? tag.id : null,
  };
};

const sameSettings = (a: Partial<PomodoroSettings> | undefined, b: PomodoroSettings): boolean =>
  a !== undefined &&
  a.focusS === b.focusS &&
  a.shortBreakS === b.shortBreakS &&
  a.longBreakS === b.longBreakS &&
  a.blocksPerLongBreak === b.blocksPerLongBreak;

/**
 * Save the idle screen's choices. A change to the mode or the Pomodoro lengths
 * also stamps `settingsUpdatedAt`, which is what sync uploads to the account's
 * other devices (newest wins). The tag is this device's alone and never
 * stamps it. The stamp only moves forward, so two edits in one millisecond
 * still read as two.
 */
export const saveTimerPrefs = (db: WorkTimerDb, prefs: TimerPrefs, now: number): Promise<void> =>
  db.transaction('rw', db.meta, async () => {
    const mode = await readMeta<unknown>(db, META_KEYS.timerMode);
    const settings = await readMeta<Partial<PomodoroSettings>>(db, META_KEYS.pomodoroSettings);
    if (mode !== prefs.mode || !sameSettings(settings, prefs.settings)) {
      await touchSettings(db, now);
    }
    await writeMeta(db, META_KEYS.timerMode, prefs.mode);
    await writeMeta(db, META_KEYS.pomodoroSettings, prefs.settings);
    if (prefs.tagId === null) await clearMeta(db, META_KEYS.lastTagId);
    else await writeMeta(db, META_KEYS.lastTagId, prefs.tagId);
  });

/**
 * Apply `patch` to whatever is stored right now, in one transaction. Quick
 * successive edits (a stepper held down) each build on the last, even before
 * the screen has caught up with the previous one.
 */
export const updateTimerPrefs = (
  db: WorkTimerDb,
  patch: Partial<TimerPrefs>,
  limits: PomodoroLimits,
  now: number,
): Promise<void> =>
  db.transaction('rw', db.meta, db.tags, async () => {
    const current = await readTimerPrefs(db, limits);
    await saveTimerPrefs(db, { ...current, ...patch }, now);
  });
