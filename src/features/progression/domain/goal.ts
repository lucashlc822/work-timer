import { addDays, dayKey, dayStart, overlapMs, type FocusInterval } from '@/shared/lib';

/**
 * The daily goal, in focus minutes (M6). Progress is derived, never stored,
 * and measured the way the stats measure a day: the part of each session's
 * focus that falls inside the day, so a session over midnight is split.
 */

type GoalSession = Pick<FocusInterval, 'startedAt' | 'endedAt' | 'outcome' | 'actualFocusS'>;

/** Seconds of focus inside the local day beginning at `day` (a local midnight). */
export const focusOnDay = (sessions: readonly GoalSession[], day: Date): number => {
  const from = day.getTime();
  const to = addDays(day, 1).getTime();
  return sessions.reduce((sum, s) => sum + overlapMs(s, from, to), 0) / 1000;
};

export interface GoalProgress {
  focusMin: number;
  goalMin: number;
  reached: boolean;
}

export const goalProgress = (
  sessions: readonly GoalSession[],
  goalMin: number,
  now: number,
): GoalProgress => {
  const focusMin = Math.floor(focusOnDay(sessions, dayStart(now)) / 60);
  return { focusMin, goalMin, reached: focusMin >= goalMin };
};

/**
 * When the day's focus first reached the goal: the end of the session whose
 * focus tipped it over, never later than the end of the day. `null` if it
 * didn't. Deterministic from the sessions alone, so every device agrees.
 */
export const goalReachedAt = (
  sessions: readonly GoalSession[],
  day: Date,
  goalMin: number,
): number | null => {
  const from = day.getTime();
  const to = addDays(day, 1).getTime();
  const inDay = sessions
    .map((s) => ({ s, ms: overlapMs(s, from, to) }))
    .filter((x) => x.ms > 0)
    .sort((a, b) => a.s.startedAt - b.s.startedAt);
  let total = 0;
  for (const { s, ms } of inDay) {
    total += ms;
    if (total >= goalMin * 60_000) {
      return Math.min(s.startedAt + s.actualFocusS * 1000, to - 1);
    }
  }
  return null;
};

/** The days the goal bonus is evaluated for: today and yesterday, as local midnights. */
export const bonusDays = (now: number): Date[] => {
  const today = dayStart(now);
  return [addDays(today, -1), today];
};

export const goalRef = (day: Date): string => dayKey(day.getTime());
