import { expect, test, type Page } from '@playwright/test';

import {
  dismissResult,
  goHome,
  goToTimer,
  signIn,
  skipMoment,
  stardustBalance,
} from '../support/app';
import { startClockAtYesterdayNoon, yesterdayNoon } from '../support/clock';
import { addCompletedSession } from '../support/friends';
import { createUser, type TestUser } from '../support/users';

/**
 * A finished session's reward tally (session-complete redesign, PR 2): one line
 * per kind of Stardust it earned, then the total, and that total is exactly what
 * the balance goes up by.
 *
 * At the desktop app's default 480x720, so the tallest result is also checked to
 * fit the window.
 */
test.use({ viewport: { width: 480, height: 720 } });

/**
 * The page's day is yesterday, from noon: these tests read "Today N of 60 min",
 * which a clock merely shifted back gets wrong between midnight and ~03:00.
 */
const signedIn = async (page: Page, user: TestUser) => {
  await startClockAtYesterdayNoon(page);
  await page.goto('/');
  await signIn(page, user);
  await goToTimer(page);
};

/** Runs a 25-minute session to its end and lets its moment settle. */
const finishASession = async (page: Page) => {
  await goToTimer(page);
  await page.getByRole('button', { name: 'Start 25 min' }).click();
  await expect(page.getByRole('timer')).toContainText('25:00');
  await page.clock.fastForward('25:01');
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
  await expect(page.locator('[data-stage]')).toHaveAttribute('data-stage', 'settled', {
    timeout: 5_000,
  });
};

const tally = (page: Page) => page.getByTestId('reward-total');

test('a first session shows its own Stardust only (PR 2, case 1)', async ({ page }) => {
  await signedIn(page, await createUser('tally-first'));
  await finishASession(page);
  await expect(tally(page)).toHaveText('✦+25 Stardust');
  await expect(page.getByText('Daily goal reached')).toHaveCount(0);
  await expect(page.getByText('Today 25 of 60 min')).toBeVisible();
  await expect(page.getByRole('status').first()).toContainText('Earned 25 Stardust.');
  await dismissResult(page);
  await expect.poll(() => stardustBalance(page)).toBe(25);
});

test('the session that reaches the daily goal shows the bonus, and fits the window (PR 2, cases 2, 7 and 8)', async ({
  page,
}) => {
  const user = await createUser('tally-goal');
  // 40 minutes already "today" (the page's day), ending 5 minutes before its noon.
  await addCompletedSession(user, 40, (Date.now() - yesterdayNoon()) / 60_000 + 5);
  await signedIn(page, user);
  await expect(page.getByText('Today 40 of 60 min')).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => stardustBalance(page)).toBe(40);

  await finishASession(page);
  await expect(page.getByText('Focus · 25 min')).toBeVisible();
  await expect(page.getByText('Daily goal reached')).toBeVisible();
  await expect(tally(page)).toHaveText('✦+45 Stardust');
  // One sentence for a screen reader, in the result's status.
  await expect(page.getByRole('status').first()).toContainText(
    "Earned 45 Stardust: 25 for focus, 20 for reaching today's goal.",
  );

  // The tallest result there is still fits the desktop app's window.
  // The timer page has no footer: its main is the whole window when nothing scrolls.
  const nav = await page.getByRole('main').boundingBox();
  const { scrollHeight, innerHeight } = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
  }));
  expect(scrollHeight).toBeLessThanOrEqual(innerHeight);
  expect((nav?.y ?? 0) + (nav?.height ?? 0)).toBeLessThanOrEqual(720);

  await dismissResult(page);
  await expect.poll(() => stardustBalance(page)).toBe(40 + 45);
});

test('the star that finishes a constellation shows its bonus (PR 2, case 5)', async ({ page }) => {
  await signedIn(page, await createUser('tally-kite'));
  await goHome(page);
  await page.getByRole('button', { name: 'Choose a constellation' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^The Kite/ })
    .click();
  for (let i = 0; i < 3; i++) {
    await goToTimer(page);
    await page.getByRole('button', { name: 'Start 25 min' }).click();
    await expect(page.getByRole('timer')).toContainText('25:00');
    await page.clock.fastForward('25:01');
    await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
    await dismissResult(page);
  }
  await expect.poll(() => stardustBalance(page)).toBe(3 * 25 + 20);
  const before = await stardustBalance(page);

  await finishASession(page);
  await expect(page.getByText('The Kite complete')).toBeVisible();
  await expect(tally(page)).toHaveText('✦+50 Stardust');
  await skipMoment(page);
  await dismissResult(page);
  await expect.poll(() => stardustBalance(page)).toBe(before + 50);
});
