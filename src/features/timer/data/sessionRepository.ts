import { clearMeta, META_KEYS, readMeta, writeMeta } from '@/shared/db';
import type { SessionRow, WorkTimerDb } from '@/shared/db';
import { newId, newSeed, type Clock } from '@/shared/lib';

import { breakFor } from '../domain/pomodoro';
import type {
  ActiveSession,
  PomodoroRun,
  SessionDraft,
  SessionEnding,
  StartedSession,
} from '../domain/types';

/**
 * Persistence for the timer.
 *
 * The in-flight session is found through `META_KEYS.activeSessionId` rather
 * than by querying for `endedAt === null` (IndexedDB does not index null).
 * Every write that changes whether a session is in flight updates the row and
 * the pointer in one transaction, so the two can never disagree after a crash
 * between them.
 *
 * Pomodoro (M3) adds a second pointer, `META_KEYS.activeRun`, written in the
 * same transactions: a block's completion and the start of the break after it
 * land together, or not at all.
 */

export interface StartContext {
  clock: Clock;
  /** From `describeHost(runtime)`. */
  device: string;
}

export class ActiveSessionExistsError extends Error {
  readonly activeId: string;

  constructor(activeId: string) {
    super(`A session is already in progress (${activeId}).`);
    this.activeId = activeId;
    this.name = 'ActiveSessionExistsError';
  }
}

export class ActiveRunExistsError extends Error {
  readonly runId: string;

  constructor(runId: string) {
    super(`A Pomodoro run is already in progress (${runId}).`);
    this.runId = runId;
    this.name = 'ActiveRunExistsError';
  }
}

const toActive = (row: SessionRow): ActiveSession => ({
  id: row.id,
  mode: row.mode,
  runId: row.runId ?? null,
  runIndex: row.runIndex ?? null,
  startedAt: row.startedAt,
  plannedDurationS: row.plannedDurationS,
  seed: row.seed,
  tagId: row.tagId,
  device: row.device,
  awayMs: row.awayMs,
});

export const isInFlight = (row: SessionRow | undefined): row is SessionRow =>
  row !== undefined && row.endedAt === null;

/** The in-flight session the pointer names, or undefined (dangling counts as none). */
export const readInFlight = async (db: WorkTimerDb): Promise<SessionRow | undefined> => {
  const activeId = await readMeta<string>(db, META_KEYS.activeSessionId);
  if (activeId === undefined) return undefined;
  const row = await db.sessions.get(activeId);
  return isInFlight(row) ? row : undefined;
};

/**
 * Write a new in-flight row and point `activeSessionId` at it. Callers must
 * already be inside a `sessions` + `meta` transaction and have checked that
 * nothing else is in flight.
 */
export const addInFlightSession = async (
  db: WorkTimerDb,
  fields: Pick<SessionRow, 'plannedDurationS' | 'tagId'> &
    ({ mode: 'countdown' } | { mode: 'pomodoro'; runId: string; runIndex: number }),
  ctx: StartContext,
): Promise<ActiveSession> => {
  const now = ctx.clock.now();
  const row: SessionRow = {
    id: newId(),
    actualFocusS: 0,
    startedAt: now,
    endedAt: null,
    outcome: null,
    awayMs: 0,
    seed: newSeed(),
    device: ctx.device,
    clientCreatedAt: now,
    syncedAt: null,
    ...fields,
  };
  await db.sessions.add(row);
  await writeMeta(db, META_KEYS.activeSessionId, row.id);
  return toActive(row);
};

/**
 * Create a session and make it the active one. A Pomodoro draft also creates
 * the run, and the session is its first block.
 *
 * Rejects with `ActiveSessionExistsError` if a session is already in flight,
 * or `ActiveRunExistsError` if a run is (even between blocks), rather than
 * silently starting a second. A dangling pointer (to a missing or
 * already-finished row) does not count as active.
 */
export const startSession = (
  db: WorkTimerDb,
  draft: SessionDraft,
  ctx: StartContext,
): Promise<StartedSession> =>
  db.transaction('rw', db.sessions, db.meta, async () => {
    const active = await readInFlight(db);
    if (active !== undefined) throw new ActiveSessionExistsError(active.id);

    if (draft.mode === 'countdown') {
      const session = await addInFlightSession(
        db,
        { mode: 'countdown', plannedDurationS: draft.plannedDurationS, tagId: draft.tagId },
        ctx,
      );
      return { session, run: null };
    }

    const existing = await readMeta<PomodoroRun>(db, META_KEYS.activeRun);
    if (existing !== undefined) throw new ActiveRunExistsError(existing.id);

    const run: PomodoroRun = {
      id: newId(),
      startedAt: ctx.clock.now(),
      settings: { ...draft.settings },
      blocksDone: 0,
      break: null,
      tagId: draft.tagId,
    };
    await writeMeta(db, META_KEYS.activeRun, run);
    const session = await addInFlightSession(
      db,
      {
        mode: 'pomodoro',
        plannedDurationS: run.settings.focusS,
        tagId: draft.tagId,
        runId: run.id,
        runIndex: 1,
      },
      ctx,
    );
    return { session, run };
  });

/**
 * The active session, without writing anything.
 *
 * Safe inside a Dexie `liveQuery` (which is read-only), so this is what the
 * mini window uses. A dangling pointer reads as "nothing active".
 */
export const peekActiveSession = async (db: WorkTimerDb): Promise<ActiveSession | undefined> => {
  const activeId = await readMeta<string>(db, META_KEYS.activeSessionId);
  if (activeId === undefined) return undefined;
  const row = await db.sessions.get(activeId);
  return isInFlight(row) ? toActive(row) : undefined;
};

/** Like `peekActiveSession`, but also clears a dangling pointer it finds. */
export const loadActiveSession = (db: WorkTimerDb): Promise<ActiveSession | undefined> =>
  db.transaction('rw', db.sessions, db.meta, async () => {
    const activeId = await readMeta<string>(db, META_KEYS.activeSessionId);
    if (activeId === undefined) return undefined;

    const row = await db.sessions.get(activeId);
    if (!isInFlight(row)) {
      await clearMeta(db, META_KEYS.activeSessionId);
      return undefined;
    }
    return toActive(row);
  });

/**
 * Write a session's final fields and clear the active pointer.
 *
 * For a Pomodoro block, the run moves on in the same transaction: a completed
 * block bumps `blocksDone` and starts the break at the block's `endedAt`; a
 * cancelled block ends the run. Resolves to the run as it now stands, or null
 * when there is none (a countdown, or a run that just ended).
 *
 * Idempotent: finishing a session that is already finished (or missing) leaves
 * the row *and the run* untouched. That is what makes "reload twice after
 * completing while away" safe — both reloads resume, both try to finish, one
 * write lands.
 */
export const finishSession = (
  db: WorkTimerDb,
  id: string,
  end: SessionEnding,
): Promise<PomodoroRun | null> =>
  db.transaction('rw', db.sessions, db.meta, async () => {
    const row = await db.sessions.get(id);
    let run = (await readMeta<PomodoroRun>(db, META_KEYS.activeRun)) ?? null;
    const ownsRun = run !== null && row?.runId === run.id;

    if (isInFlight(row)) {
      // A completed star is born in the style equipped right now (M6) and keeps
      // it: this is the only place the style is written, and a finished row is
      // never rewritten. An early ending earns no star, so it gets no style.
      const style =
        end.outcome === 'completed' ? await readMeta<unknown>(db, META_KEYS.starStyle) : undefined;
      await db.sessions.update(id, {
        outcome: end.outcome,
        endedAt: end.endedAt,
        actualFocusS: end.actualFocusS,
        ...(typeof style === 'string' && { starStyle: style }),
      });

      if (run !== null && ownsRun) {
        if (end.outcome === 'completed') {
          const blocksDone = run.blocksDone + 1;
          run = { ...run, blocksDone, break: breakFor(blocksDone, run.settings, end.endedAt) };
          await writeMeta(db, META_KEYS.activeRun, run);
        } else {
          await clearMeta(db, META_KEYS.activeRun);
          run = null;
        }
      }
    }

    if ((await readMeta<string>(db, META_KEYS.activeSessionId)) === id) {
      await clearMeta(db, META_KEYS.activeSessionId);
    }

    return ownsRun ? run : null;
  });

/**
 * Change the tag of the session in flight. Resolves to whether it applied:
 * a session that has already finished is left alone (completed sessions are
 * immutable, and a tag frozen at the end is the whole rule).
 *
 * For a Pomodoro block the run's tag moves in the same transaction, so the
 * blocks after this one carry it even across a reload during a break.
 */
export const setInFlightTag = (
  db: WorkTimerDb,
  id: string,
  tagId: string | null,
): Promise<boolean> =>
  db.transaction('rw', db.sessions, db.meta, async () => {
    const row = await db.sessions.get(id);
    if (!isInFlight(row)) return false;
    await db.sessions.update(id, { tagId });

    const run = await readMeta<PomodoroRun>(db, META_KEYS.activeRun);
    if (run !== undefined && row.runId === run.id) {
      await writeMeta(db, META_KEYS.activeRun, { ...run, tagId });
    }
    return true;
  });

/**
 * Add to a session's away time. A no-op once the session has finished:
 * completed sessions are immutable, and away time is a stat, not something
 * worth breaking that rule for.
 */
export const addAwayTime = (db: WorkTimerDb, id: string, deltaMs: number): Promise<void> =>
  db.transaction('rw', db.sessions, async () => {
    if (deltaMs <= 0) return;
    const row = await db.sessions.get(id);
    if (!isInFlight(row)) return;
    await db.sessions.update(id, { awayMs: row.awayMs + Math.round(deltaMs) });
  });
