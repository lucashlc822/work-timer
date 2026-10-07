import { clearMeta, META_KEYS, readMeta, writeMeta } from '@/shared/db';
import type { SessionRow, WorkTimerDb } from '@/shared/db';
import { newId, newSeed, type Clock } from '@/shared/lib';

import type { ActiveSession, SessionDraft, SessionEnding } from '../domain/types';

/**
 * Persistence for the timer.
 *
 * The in-flight session is found through `META_KEYS.activeSessionId` rather
 * than by querying for `endedAt === null` (IndexedDB does not index null).
 * Every write that changes whether a session is in flight updates the row and
 * the pointer in one transaction, so the two can never disagree after a crash
 * between them.
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

const toActive = (row: SessionRow): ActiveSession => ({
  id: row.id,
  startedAt: row.startedAt,
  plannedDurationS: row.plannedDurationS,
  seed: row.seed,
  tagId: row.tagId,
  device: row.device,
  awayMs: row.awayMs,
});

const isInFlight = (row: SessionRow | undefined): row is SessionRow =>
  row !== undefined && row.endedAt === null;

/**
 * Create a session and make it the active one.
 *
 * Rejects with `ActiveSessionExistsError` if a session is already in flight,
 * rather than silently starting a second. A dangling pointer (to a missing or
 * already-finished row) does not count as active.
 */
export const startSession = (
  db: WorkTimerDb,
  draft: SessionDraft,
  ctx: StartContext,
): Promise<ActiveSession> =>
  db.transaction('rw', db.sessions, db.meta, async () => {
    const activeId = await readMeta<string>(db, META_KEYS.activeSessionId);
    if (activeId !== undefined && isInFlight(await db.sessions.get(activeId))) {
      throw new ActiveSessionExistsError(activeId);
    }

    const now = ctx.clock.now();
    const row: SessionRow = {
      id: newId(),
      mode: 'countdown',
      plannedDurationS: draft.plannedDurationS,
      actualFocusS: 0,
      startedAt: now,
      endedAt: null,
      outcome: null,
      awayMs: 0,
      tagId: draft.tagId,
      seed: newSeed(),
      device: ctx.device,
      clientCreatedAt: now,
      syncedAt: null,
    };

    await db.sessions.add(row);
    await writeMeta(db, META_KEYS.activeSessionId, row.id);
    return toActive(row);
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
 * Idempotent: finishing a session that is already finished (or missing) leaves
 * the row untouched. That is what makes "reload twice after completing while
 * away" safe — both reloads resume, both try to finish, one write lands.
 */
export const finishSession = (db: WorkTimerDb, id: string, end: SessionEnding): Promise<void> =>
  db.transaction('rw', db.sessions, db.meta, async () => {
    const row = await db.sessions.get(id);

    if (isInFlight(row)) {
      await db.sessions.update(id, {
        outcome: end.outcome,
        endedAt: end.endedAt,
        actualFocusS: end.actualFocusS,
      });
    }

    if ((await readMeta<string>(db, META_KEYS.activeSessionId)) === id) {
      await clearMeta(db, META_KEYS.activeSessionId);
    }
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
