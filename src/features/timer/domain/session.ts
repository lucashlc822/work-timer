import type { ActiveSession, SessionEnding } from './types';

/**
 * Time arithmetic for a session in flight.
 *
 * Every function takes `now` as an argument and never reads a clock itself.
 * That is the whole testability story: the timer's correctness reduces to
 * these pure functions, exercised with arbitrary timestamps, and nothing about
 * them depends on how often — or whether — a repaint fired.
 */

/**
 * Milliseconds since the session started, clamped to zero.
 *
 * The clamp covers the device clock moving backwards past `startedAt` (an NTP
 * correction, or a manual edit). A negative elapsed time has no meaning, and
 * letting it through would produce a remaining time longer than the session.
 */
export const elapsedMs = (s: ActiveSession, now: number): number => Math.max(0, now - s.startedAt);

export const plannedEndAt = (s: ActiveSession): number => s.startedAt + s.plannedDurationS * 1000;

/** Milliseconds left, clamped to zero once the planned end has passed. */
export const remainingMs = (s: ActiveSession, now: number): number =>
  Math.max(0, s.plannedDurationS * 1000 - elapsedMs(s, now));

export const isComplete = (s: ActiveSession, now: number): boolean => now >= plannedEndAt(s);

/** Fraction of the session elapsed, in [0, 1]. For progress bars. */
export const progress = (s: ActiveSession, now: number): number =>
  s.plannedDurationS <= 0 ? 1 : Math.min(1, elapsedMs(s, now) / (s.plannedDurationS * 1000));

/**
 * The ending for a session that ran its course.
 *
 * `endedAt` is the planned end regardless of when this is called. A session
 * that finished while the app was quit ended when it ended, not when the app
 * was next opened — getting this wrong would silently corrupt every later
 * stat and streak.
 */
export const completedEnding = (s: ActiveSession): SessionEnding => ({
  outcome: 'completed',
  endedAt: plannedEndAt(s),
  actualFocusS: s.plannedDurationS,
});

/** The ending for a deliberate cancel at `now`. Credits whole seconds focused. */
export const cancelledEnding = (s: ActiveSession, now: number): SessionEnding => ({
  outcome: 'cancelled',
  endedAt: Math.max(now, s.startedAt),
  actualFocusS: Math.min(Math.floor(elapsedMs(s, now) / 1000), s.plannedDurationS),
});
