import type { TimerStatus } from '@/features/timer';

/**
 * The main window's two pages. Home is the dashboard (what you are building,
 * where to go); the timer page is the timer and nothing else. Overlays (the
 * sky, panels, a friend's sky) open over either.
 *
 * Pure, so the rules below are unit-tested rather than discovered in e2e.
 */
export type Page = 'home' | 'timer';

/** A session or Pomodoro run is in progress, or its result is waiting to be seen. */
const IN_PROGRESS: ReadonlySet<TimerStatus> = new Set<TimerStatus>([
  'starting',
  'running',
  'finishing',
  'finished',
  'onBreak',
  'breakOver',
  'runSummary',
]);

export const inProgress = (status: TimerStatus): boolean => IN_PROGRESS.has(status);

/**
 * Where the app opens. While the timer is still reading the store there is no
 * answer yet (null: show only the sky), so a launch mid-session never flashes
 * home first. In progress, or in a focus-together lobby, the timer page is
 * restored (Apple HIG: restore the previous state); otherwise home.
 */
export const initialPage = (status: TimerStatus, inRoom: boolean): Page | null => {
  if (status === 'loading') return null;
  return inProgress(status) || inRoom ? 'timer' : 'home';
};

/**
 * The page after the timer's status changes from `prev` to `next`. Any change
 * into an in-progress status brings the timer page forward: a session started
 * (a friend's room starting counts), one finishing while you were home, a break
 * ending. Going home mid-session is allowed and stays put while nothing changes.
 */
export const pageOnStatusChange = (page: Page, prev: TimerStatus, next: TimerStatus): Page =>
  prev !== next && inProgress(next) ? 'timer' : page;

/** What one press of Escape does, with no overlay open (overlays close themselves first). */
export const escapeGoesHome = (page: Page, status: TimerStatus, inRoom: boolean): boolean =>
  page === 'timer' && status === 'idle' && !inRoom;
