import type { Page } from '@playwright/test';

/**
 * The page's clock, started in the past.
 *
 * The app computes elapsed time from timestamps (shared/lib/clock.ts), so a
 * 25-minute session can be finished in a test by moving the page's clock 25
 * minutes forward. But the server refuses a session that ends more than five
 * minutes in *its* future (`session_not_from_the_future`), and its clock is the
 * real one. So the page's clock starts well before real time: the fast-forwarded
 * session then ends in the past, the way a real one would, and uploads normally.
 *
 * Call before the first `page.goto`. After that, time flows at its normal rate
 * until `fastForward` jumps it.
 */
export const startClockInThePast = async (page: Page, minutesAgo = 120): Promise<void> => {
  await page.clock.install({ time: new Date(Date.now() - minutesAgo * 60_000) });
};
