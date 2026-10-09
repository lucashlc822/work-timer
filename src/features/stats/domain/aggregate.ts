import type { SessionRow } from '@/shared/db';

import { bucketsFor, type Bucket, type Period } from './period';

/**
 * Stats arithmetic over finished sessions. Pure: rows in, numbers out.
 *
 * Two different questions are answered two different ways, on purpose:
 *
 * - *How much focus happened in this period?* A session's focus is the
 *   interval `[startedAt, startedAt + actualFocusS)`, and only the part inside
 *   the period counts. A 23:30 session of 50 minutes gives 30 minutes to one
 *   day and 20 to the next, and a session that began before the period still
 *   contributes the part that spilled in.
 * - *How many sessions belong to this period?* By `startedAt`: a session
 *   belongs to the period it began in. Counts, stars and the history list use
 *   this, so a session is never listed twice across two adjacent weeks.
 *
 * A session still in flight is never counted; it has no outcome yet.
 */

export const isEnded = (s: SessionRow): boolean => s.endedAt !== null && s.outcome !== null;

const focusEndMs = (s: SessionRow): number => s.startedAt + s.actualFocusS * 1000;

/** Milliseconds of this session's focus inside `[from, to)`. */
export const overlapMs = (s: SessionRow, from: number, to: number): number => {
  if (!isEnded(s) || s.actualFocusS <= 0) return 0;
  return Math.max(0, Math.min(focusEndMs(s), to) - Math.max(s.startedAt, from));
};

/** Whether the session began inside the period (ended sessions only). */
export const startedIn = (s: SessionRow, period: Period): boolean =>
  isEnded(s) && s.startedAt >= period.start && s.startedAt < period.end;

export interface FocusBucket extends Bucket {
  focusS: number;
}

export const focusBuckets = (sessions: readonly SessionRow[], period: Period): FocusBucket[] =>
  bucketsFor(period).map((bucket) => ({
    ...bucket,
    focusS: sessions.reduce((sum, s) => sum + overlapMs(s, bucket.start, bucket.end), 0) / 1000,
  }));

export interface TagFocus {
  /** Null is "untagged". */
  tagId: string | null;
  focusS: number;
}

/** Focus per tag inside the period, biggest first. Tags with no focus are left out. */
export const focusByTag = (sessions: readonly SessionRow[], period: Period): TagFocus[] => {
  const ms = new Map<string | null, number>();
  for (const s of sessions) {
    const inside = overlapMs(s, period.start, period.end);
    if (inside > 0) ms.set(s.tagId, (ms.get(s.tagId) ?? 0) + inside);
  }
  return [...ms.entries()]
    .map(([tagId, total]) => ({ tagId, focusS: total / 1000 }))
    .sort((a, b) => b.focusS - a.focusS);
};

export interface Totals {
  /** Focus inside the period, including any that spilled in from the day before. */
  focusS: number;
  /** Completed sessions — one star each. */
  stars: number;
  completed: number;
  /** Sessions the user ended deliberately. They earn no star. */
  endedEarly: number;
  /** Mean focus of the sessions that began in the period; 0 when there are none. */
  avgSessionS: number;
  /** Time the app was hidden during sessions that began in the period. */
  awayMs: number;
}

export const totals = (sessions: readonly SessionRow[], period: Period): Totals => {
  const members = sessions.filter((s) => startedIn(s, period));
  const completed = members.filter((s) => s.outcome === 'completed').length;
  const memberFocusS = members.reduce((sum, s) => sum + Math.max(0, s.actualFocusS), 0);

  return {
    focusS: sessions.reduce((sum, s) => sum + overlapMs(s, period.start, period.end), 0) / 1000,
    stars: completed,
    completed,
    endedEarly: members.length - completed,
    avgSessionS: members.length === 0 ? 0 : memberFocusS / members.length,
    awayMs: members.reduce((sum, s) => sum + s.awayMs, 0),
  };
};

/** The sessions that began in the period, newest first. */
export const historyFor = (sessions: readonly SessionRow[], period: Period): SessionRow[] =>
  sessions.filter((s) => startedIn(s, period)).sort((a, b) => b.startedAt - a.startedAt);
