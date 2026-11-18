import { breakRemainingMs, isBreakOver } from './pomodoro';
import { remainingMs } from './session';
import type { ActiveSession, PomodoroRun } from './types';

/** The timer's status, as far as a glance from another page needs it. */
export type GlanceStatus =
  | 'loading'
  | 'idle'
  | 'starting'
  | 'running'
  | 'finishing'
  | 'finished'
  | 'onBreak'
  | 'breakOver'
  | 'runSummary';

/** Whole minutes left, rounded up: "1 min left" until the very end. */
const minutesLeft = (ms: number): number => Math.max(1, Math.ceil(ms / 60_000));

/**
 * One line saying what the timer is doing, for a page that isn't showing it
 * ("Focusing · 18 min left"). Minute resolution on purpose: a glance is read
 * now and then, and must not ask its page to repaint every second. Null when
 * there is nothing in progress.
 */
export const timerGlance = (
  status: GlanceStatus,
  session: ActiveSession | null,
  run: PomodoroRun | null,
  now: number,
): string | null => {
  switch (status) {
    case 'starting':
    case 'running':
      return session === null
        ? 'Focusing'
        : `Focusing · ${minutesLeft(remainingMs(session, now))} min left`;
    case 'finishing':
    case 'finished':
      return 'Your star is waiting';
    case 'onBreak': {
      const brk = run?.break ?? null;
      return brk === null || isBreakOver(brk, now)
        ? 'Break over'
        : `On a break · ${minutesLeft(breakRemainingMs(brk, now))} min left`;
    }
    case 'breakOver':
      return 'Break over · the next block is ready';
    case 'runSummary':
      return 'Your run is complete';
    default:
      return null;
  }
};
