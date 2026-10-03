import { completedEnding, isComplete, remainingMs } from './session';
import type { ActiveSession } from './types';

export type ResumeVerdict =
  | { kind: 'running'; remainingMs: number }
  | { kind: 'completed'; endedAt: number; actualFocusS: number };

/**
 * Where an in-flight session stands at `now`.
 *
 * This one function is the whole of background continuation. It runs when the
 * app starts and whenever the window becomes visible again; there is no clock
 * to keep alive in between, because the answer is always derivable from
 * `startedAt`.
 *
 * A completed verdict carries the *planned* end time — see `completedEnding`.
 */
export const resumeVerdict = (session: ActiveSession, now: number): ResumeVerdict => {
  if (isComplete(session, now)) {
    const { endedAt, actualFocusS } = completedEnding(session);
    return { kind: 'completed', endedAt, actualFocusS };
  }
  return { kind: 'running', remainingMs: remainingMs(session, now) };
};
