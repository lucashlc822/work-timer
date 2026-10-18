import { addDays, dayKey, dayStart, isEnded, type FocusInterval } from '@/shared/lib';

/**
 * Streaks, derived from sessions every time they are asked for (M6) — never
 * stored, so a session arriving late from another device just changes the
 * answer.
 *
 * A day counts when a session was *completed* that local day, judged by the
 * session's start (the same rule the stats use for "which day does it belong
 * to"). Ending early doesn't count; a skipped day ends the run.
 */

type StreakSession = Pick<FocusInterval, 'startedAt' | 'endedAt' | 'outcome' | 'actualFocusS'>;

export interface StreakRun {
  /** The first day of the run, as `dayKey`. */
  startDay: string;
  /** Consecutive days with a completed session. */
  length: number;
  /** The last session start in the run's days, keyed by day — see `lastEndByDay`. */
  days: string[];
}

/** Each day that has a completed session, mapped to the latest end among that day's sessions. */
export const lastEndByDay = (sessions: readonly StreakSession[]): Map<string, number> => {
  const days = new Map<string, number>();
  for (const s of sessions) {
    if (!isEnded(s) || s.outcome !== 'completed' || s.endedAt === null) continue;
    const key = dayKey(s.startedAt);
    days.set(key, Math.max(days.get(key) ?? 0, s.endedAt));
  }
  return days;
};

/** Every run of consecutive days, oldest first. */
export const streakRuns = (sessions: readonly StreakSession[]): StreakRun[] => {
  const counted = lastEndByDay(sessions);
  const starts = [...counted.keys()].sort();
  const runs: StreakRun[] = [];
  let current: StreakRun | null = null;
  let previous: Date | null = null;

  for (const key of starts) {
    const [y, m, d] = key.split('-').map(Number) as [number, number, number];
    const day = new Date(y, m - 1, d);
    const continues =
      current !== null && previous !== null && dayKey(addDays(previous, 1).getTime()) === key;
    if (continues && current !== null) {
      current.length += 1;
      current.days.push(key);
    } else {
      current = { startDay: key, length: 1, days: [key] };
      runs.push(current);
    }
    previous = day;
  }
  return runs;
};

/**
 * The streak as of `now`: the run that ends today, or — before today's first
 * session — the run that ended yesterday, which is still alive. 0 once a whole
 * day has been skipped.
 */
export const streakAt = (sessions: readonly StreakSession[], now: number): number => {
  const counted = lastEndByDay(sessions);
  const today = dayStart(now);
  const todayKey = dayKey(today.getTime());
  const yesterdayKey = dayKey(addDays(today, -1).getTime());
  const endKey = counted.has(todayKey) ? todayKey : counted.has(yesterdayKey) ? yesterdayKey : null;
  if (endKey === null) return 0;
  const run = streakRuns(sessions).find((r) => r.days.includes(endKey));
  return run?.length ?? 0;
};
