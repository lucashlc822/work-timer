import type { PomodoroRun, PomodoroSettings, RunBreak } from './types';

/**
 * Pomodoro arithmetic: which break follows a block, how long it lasts, and
 * whether it is over.
 *
 * Like `session.ts`, every function takes `now` as an argument. A break is
 * never ticked down; its end is `startedAt + durationS`, so a break that ran
 * out while the app was quit is simply over when it is next looked at.
 */

export const DEFAULT_POMODORO: PomodoroSettings = {
  focusS: 25 * 60,
  shortBreakS: 5 * 60,
  longBreakS: 15 * 60,
  blocksPerLongBreak: 4,
};

interface Range {
  min: number;
  max: number;
  step: number;
}

export type PomodoroLimits = Record<keyof PomodoroSettings, Range>;

export const POMODORO_LIMITS: PomodoroLimits = {
  focusS: { min: 5 * 60, max: 180 * 60, step: 5 * 60 },
  shortBreakS: { min: 60, max: 30 * 60, step: 60 },
  longBreakS: { min: 5 * 60, max: 60 * 60, step: 5 * 60 },
  blocksPerLongBreak: { min: 2, max: 8, step: 1 },
};

/**
 * Dev builds only: one-minute blocks and breaks, so an acceptance run takes
 * minutes. Chosen by the caller from `import.meta.env.DEV`, which keeps this
 * module free of build-time globals (as `durations.ts` does).
 */
export const DEV_POMODORO_LIMITS: PomodoroLimits = {
  ...POMODORO_LIMITS,
  focusS: { min: 60, max: 180 * 60, step: 60 },
  longBreakS: { min: 60, max: 60 * 60, step: 60 },
};

const KEYS = Object.keys(DEFAULT_POMODORO) as (keyof PomodoroSettings)[];

const clampField = (value: unknown, range: Range, fallback: number): number => {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  const stepped = range.min + Math.round((n - range.min) / range.step) * range.step;
  return Math.min(range.max, Math.max(range.min, stepped));
};

/**
 * Snap every field onto its grid and into range. Anything missing or
 * non-finite falls back to the default (itself clamped, so the dev limits
 * stay consistent). Used on every read from storage, so a corrupt or
 * outdated saved value can never produce a NaN-length block.
 */
export const clampPomodoroSettings = (
  s: Partial<Record<keyof PomodoroSettings, unknown>> | null | undefined,
  limits: PomodoroLimits = POMODORO_LIMITS,
): PomodoroSettings => {
  const out = { ...DEFAULT_POMODORO };
  for (const key of KEYS) {
    const fallback = clampField(DEFAULT_POMODORO[key], limits[key], DEFAULT_POMODORO[key]);
    out[key] = clampField(s?.[key], limits[key], fallback);
  }
  return out;
};

/** The break after `blocksDone` completed blocks: long after every Nth. */
export const breakKindAfter = (blocksDone: number, s: PomodoroSettings): 'short' | 'long' =>
  blocksDone > 0 && blocksDone % s.blocksPerLongBreak === 0 ? 'long' : 'short';

export const breakFor = (blocksDone: number, s: PomodoroSettings, startedAt: number): RunBreak => {
  const kind = breakKindAfter(blocksDone, s);
  return { kind, startedAt, durationS: kind === 'long' ? s.longBreakS : s.shortBreakS };
};

export const breakEndsAt = (b: RunBreak): number => b.startedAt + b.durationS * 1000;

/**
 * Milliseconds of break left, clamped to [0, duration]. The upper clamp covers
 * the clock moving backwards past `startedAt`, as `session.ts` does.
 */
export const breakRemainingMs = (b: RunBreak, now: number): number =>
  Math.max(0, b.durationS * 1000 - Math.max(0, now - b.startedAt));

export const isBreakOver = (b: RunBreak, now: number): boolean => now >= breakEndsAt(b);

/** Fraction of the break elapsed, in [0, 1]. */
export const breakProgress = (b: RunBreak, now: number): number =>
  b.durationS <= 0 ? 1 : 1 - breakRemainingMs(b, now) / (b.durationS * 1000);

export type RunVerdict = { kind: 'onBreak'; remainingMs: number } | { kind: 'breakOver' };

/**
 * Where a run with no block in flight stands at `now`. A run without a break
 * (a crash between clearing the break and starting the next block) is ready
 * for its next block, which is the same as a break that has ended.
 */
export const runVerdict = (run: PomodoroRun, now: number): RunVerdict =>
  run.break !== null && !isBreakOver(run.break, now)
    ? { kind: 'onBreak', remainingMs: breakRemainingMs(run.break, now) }
    : { kind: 'breakOver' };

/** Host deadline id for the break after block `blocksDone`. Unique per break. */
export const breakDeadlineId = (runId: string, blocksDone: number): string =>
  `break:${runId}:${blocksDone}`;
