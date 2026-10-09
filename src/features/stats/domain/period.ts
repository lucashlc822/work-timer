/**
 * Calendar periods for the stats: a week, a month, or everything so far.
 *
 * All boundaries are local midnights built with `Date` arithmetic
 * (`new Date(y, m, d + 1)`), never `+ 86_400_000`: a day is 23 or 25 hours long
 * when the clocks change, and adding a fixed 24 h drifts a bucket off its
 * midnight for the rest of the period.
 */

export type PeriodKind = 'week' | 'month' | 'all';

/** Monday. 0 would be Sunday. */
export const WEEK_STARTS_ON = 1;

export interface Period {
  kind: PeriodKind;
  /** Epoch ms of the first local midnight in the period. */
  start: number;
  /** Epoch ms of the local midnight after the period; exclusive. */
  end: number;
  label: string;
}

/** One bar of the focus chart: a day, or for "all time" a month. */
export interface Bucket {
  start: number;
  end: number;
  label: string;
}

const dayStart = (at: number): Date => {
  const d = new Date(at);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

const addDays = (d: Date, days: number): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);

const shortDate = (at: number): string =>
  new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(at);

const weekLabel = (start: number, end: number): string => {
  const last = addDays(new Date(end), -1).getTime();
  const year = new Date(last).getFullYear();
  return `${shortDate(start)} – ${shortDate(last)}, ${year}`;
};

const monthLabel = (start: number): string =>
  new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(start);

/**
 * The period of `kind` that contains `at`. For `'all'`, `earliest` is the
 * start of the first session (or null when there are none); the period then
 * runs from that day to the end of today.
 */
export const periodContaining = (
  kind: PeriodKind,
  at: number,
  earliest: number | null = null,
): Period => {
  const today = dayStart(at);

  if (kind === 'week') {
    const back = (today.getDay() - WEEK_STARTS_ON + 7) % 7;
    const start = addDays(today, -back);
    const end = addDays(start, 7);
    return {
      kind,
      start: start.getTime(),
      end: end.getTime(),
      label: weekLabel(start.getTime(), end.getTime()),
    };
  }

  if (kind === 'month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    return { kind, start: start.getTime(), end: end.getTime(), label: monthLabel(start.getTime()) };
  }

  const start = dayStart(Math.min(at, earliest ?? at));
  return { kind, start: start.getTime(), end: addDays(today, 1).getTime(), label: 'All time' };
};

/** The previous (-1) or next (+1) week or month. "All time" has no neighbours. */
export const shiftPeriod = (period: Period, by: -1 | 1): Period => {
  if (period.kind === 'all') return period;
  const from = new Date(period.start);
  const target =
    period.kind === 'week'
      ? addDays(from, 7 * by)
      : new Date(from.getFullYear(), from.getMonth() + by, 1);
  return periodContaining(period.kind, target.getTime());
};

/** True when `now` falls inside the period, so there is nothing later to page to. */
export const isCurrent = (period: Period, now: number): boolean =>
  period.kind === 'all' || (period.start <= now && now < period.end);

const dayLabel = (period: Period, at: number): string =>
  new Intl.DateTimeFormat(
    undefined,
    period.kind === 'week' ? { weekday: 'short' } : { day: 'numeric' },
  ).format(at);

/**
 * The bars of the focus chart: one per local day for a week or month, one per
 * calendar month for "all time". Contiguous, and covering exactly
 * `[period.start, period.end)`.
 */
export const bucketsFor = (period: Period): Bucket[] => {
  const buckets: Bucket[] = [];

  if (period.kind === 'all') {
    let cursor = new Date(period.start);
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    while (cursor.getTime() < period.end) {
      const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      buckets.push({
        // The first month starts mid-month; clamp so buckets stay inside the period.
        start: Math.max(cursor.getTime(), period.start),
        end: Math.min(next.getTime(), period.end),
        label: new Intl.DateTimeFormat(undefined, { month: 'short' }).format(cursor),
      });
      cursor = next;
    }
    return buckets;
  }

  let cursor = new Date(period.start);
  while (cursor.getTime() < period.end) {
    const next = addDays(cursor, 1);
    buckets.push({
      start: cursor.getTime(),
      end: next.getTime(),
      label: dayLabel(period, cursor.getTime()),
    });
    cursor = next;
  }
  return buckets;
};
