import type { SessionRow, TagRow, WorkTimerDb } from '@/shared/db';

import { isEnded } from '../domain/aggregate';
import type { Period } from '../domain/period';

/**
 * Reads for the stats. Nothing here writes: stats are derived from sessions on
 * every read, so there is no aggregate to keep in step.
 *
 * Tags are read straight from `db.tags` rather than through the tags feature —
 * features stay opaque to each other, and the table is a shared storage
 * contract.
 */

/**
 * How far before a period a session can start and still reach into it. A
 * session is at most a few hours; a day is a comfortable bound.
 */
const LOOKBACK_MS = 24 * 3_600_000;

/** Ended sessions that began in the period, plus any that spilled in from before it. */
export const readSessionsFor = (db: WorkTimerDb, period: Period): Promise<SessionRow[]> =>
  db.sessions
    .where('startedAt')
    .between(period.start - LOOKBACK_MS, period.end, true, false)
    .filter(isEnded)
    .toArray();

/** When the first session began, or null if there are none. Feeds the "all time" start. */
export const readEarliestStart = async (db: WorkTimerDb): Promise<number | null> => {
  const first = await db.sessions.orderBy('startedAt').filter(isEnded).first();
  return first?.startedAt ?? null;
};

/** Every tag, archived included — old sessions keep their label. */
export const readTagsById = async (db: WorkTimerDb): Promise<Map<string, TagRow>> =>
  new Map((await db.tags.toArray()).map((t) => [t.id, t]));
