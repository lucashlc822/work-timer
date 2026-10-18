import type { SessionRow } from '@/shared/db';

/**
 * Every number in Starkeep's economy lives in this file (M6), so tuning it is
 * one edit. Changing how an *existing* kind of row is computed is not tuning,
 * though: ledger ids are derived from what they pay for, so two app versions
 * computing different amounts for the same fact would race to insert it. A
 * changed rule gets a new id namespace (see `reconcile.ts`) and old rows stand.
 */

/** Stardust per whole focused minute of a completed session. */
export const STARDUST_PER_MINUTE = 1;

/**
 * What a session earns: whole focused minutes, completed sessions only. An
 * early ending earns nothing, just as it earns no star; each finished Pomodoro
 * block is its own session and earns for itself.
 */
export const sessionEarning = (session: Pick<SessionRow, 'outcome' | 'actualFocusS'>): number =>
  session.outcome === 'completed'
    ? Math.floor(Math.max(0, session.actualFocusS) / 60) * STARDUST_PER_MINUTE
    : 0;

/** Focus minutes per day to aim for until the person picks their own. */
export const DEFAULT_DAILY_GOAL_MIN = 60;

/** The bounds of the goal setting; the server's check constraint is the same. */
export const MIN_DAILY_GOAL_MIN = 5;
export const MAX_DAILY_GOAL_MIN = 1440;

/** Paid once for each day the goal is reached. */
export const GOAL_BONUS = 20;

/** Streak length (days) → bonus, paid once per run when the run first reaches it. */
const STREAK_BONUSES: Readonly<Record<number, number>> = { 3: 30, 7: 70, 14: 150, 30: 300 };

/** After day 30 the same bonus returns every this many days (60, 90, …). */
const STREAK_REPEAT_EVERY = 30;
const STREAK_REPEAT_BONUS = 300;

/** What reaching exactly `days` days in a row pays; 0 for a day that is no milestone. */
export const streakBonus = (days: number): number => {
  const fixed = STREAK_BONUSES[days];
  if (fixed !== undefined) return fixed;
  return days > STREAK_REPEAT_EVERY && days % STREAK_REPEAT_EVERY === 0 ? STREAK_REPEAT_BONUS : 0;
};

/** Every milestone a run of `length` days has reached, in order. */
export const streakMilestones = (length: number): number[] => {
  const reached: number[] = [];
  for (let day = 1; day <= length; day++) if (streakBonus(day) > 0) reached.push(day);
  return reached;
};

/** Paid once for each finished constellation, by the tier it was built at. */
export const CONSTELLATION_BONUS = { easy: 25, medium: 75, hard: 200 } as const;
export type BonusTier = keyof typeof CONSTELLATION_BONUS;

/** Clamp a typed or synced goal to something the server accepts. */
export const clampDailyGoal = (minutes: number): number =>
  Math.min(MAX_DAILY_GOAL_MIN, Math.max(MIN_DAILY_GOAL_MIN, Math.round(minutes)));
