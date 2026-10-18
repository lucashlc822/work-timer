/**
 * Local-calendar day arithmetic, shared by the stats and by progression's
 * streaks and daily goal (M6).
 *
 * Every boundary is a local midnight built with `Date` arithmetic
 * (`new Date(y, m, d + 1)`), never `+ 86_400_000`: a day is 23 or 25 hours long
 * when the clocks change, and a fixed 24 h drifts off its midnight.
 */

/** The local midnight that starts the day containing `at`. */
export const dayStart = (at: number): Date => {
  const d = new Date(at);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

/** The local midnight `days` calendar days after (or, negative, before) `d`'s day. */
export const addDays = (d: Date, days: number): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);

/** The local day containing `at` as `'YYYY-MM-DD'` — the stable name of a day. */
export const dayKey = (at: number): string => {
  const d = new Date(at);
  const pad = (n: number, width: number): string => String(n).padStart(width, '0');
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;
};

/** The part of a session that day arithmetic needs; `SessionRow` satisfies it. */
export interface FocusInterval {
  startedAt: number;
  actualFocusS: number;
  endedAt: number | null;
  outcome: string | null;
}

/** A session still in flight has no outcome yet and is never counted. */
export const isEnded = (s: FocusInterval): boolean => s.endedAt !== null && s.outcome !== null;

/**
 * Milliseconds of a session's focus inside `[from, to)`. Its focus is the
 * interval `[startedAt, startedAt + actualFocusS)`, so a 23:30 session of 50
 * minutes gives 30 minutes to one day and 20 to the next.
 */
export const overlapMs = (s: FocusInterval, from: number, to: number): number => {
  if (!isEnded(s) || s.actualFocusS <= 0) return 0;
  const focusEnd = s.startedAt + s.actualFocusS * 1000;
  return Math.max(0, Math.min(focusEnd, to) - Math.max(s.startedAt, from));
};
