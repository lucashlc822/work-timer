import { expect, test, type Page } from '@playwright/test';

import { dismissResult, goToTimer, signIn, skipMoment, stardustBalance } from '../support/app';
import { startClockInThePast } from '../support/clock';
import { createUser } from '../support/users';

/**
 * A Pomodoro block gets the lighter completion moment between blocks, and the
 * run summary tells everything the run earned (session-complete redesign,
 * PR 6). At the desktop app's default 480x720, where the break screen is tall.
 */
test.use({ viewport: { width: 480, height: 720 } });

const startRun = async (page: Page, name: string) => {
  const user = await createUser(name);
  await startClockInThePast(page);
  await page.goto('/');
  await signIn(page, user);
  await goToTimer(page);
  await page.getByRole('radio', { name: 'Pomodoro' }).click();
  await goToTimer(page);
  await page.getByRole('button', { name: 'Start Pomodoro' }).click();
  await expect(page.getByRole('timer')).toBeVisible();
};

const block = (page: Page) => page.locator('[data-stage]');

test('a finished block ignites, says what it earned, and fits the window (PR 6, cases 1 and 3)', async ({
  page,
}) => {
  await startRun(page, 'pom-block');
  await page.clock.fastForward('25:01');

  await expect(page.getByText('Block 1 done')).toBeVisible();
  await expect(block(page)).toHaveAttribute('data-stage', 'settled', { timeout: 2_500 });
  await expect(page.getByText('+25 Stardust')).toBeVisible();
  // Where the star went (no constellation chosen: a wandering star).
  await expect(page.getByText(/A wandering star/)).toBeVisible();
  // The lighter moment: no tally, no Start another.
  await expect(page.getByTestId('reward-total')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Start another/ })).toHaveCount(0);

  // The break is the screen's job: its countdown has the focus, and the whole
  // thing fits the desktop window with the tag picker showing.
  await expect(page.getByRole('timer')).toBeVisible();
  // The timer page has no footer: its main is the whole window when nothing scrolls.
  const nav = await page.getByRole('main').boundingBox();
  const { scrollHeight, innerHeight } = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
  }));
  expect(scrollHeight, `page is ${scrollHeight}px tall`).toBeLessThanOrEqual(innerHeight);
  expect((nav?.y ?? 0) + (nav?.height ?? 0)).toBeLessThanOrEqual(720);
});

test('ending a run tells everything it earned, and the total is what the balance rises by (PR 6, case 2)', async ({
  page,
}) => {
  await startRun(page, 'pom-run');
  await page.clock.fastForward('25:01');
  await expect(page.getByText('Block 1 done')).toBeVisible();
  await skipMoment(page);

  // Skip the break, start block 2 and finish it too.
  await page.getByRole('button', { name: 'Skip break' }).click();
  await page.getByRole('button', { name: /^Start block 2/ }).click();
  await expect(page.getByRole('timer')).toBeVisible();
  await page.clock.fastForward('25:01');
  await expect(page.getByText('Block 2 done')).toBeVisible();
  await skipMoment(page);

  await page.getByRole('button', { name: 'End run' }).click();
  await expect(page.getByRole('heading', { name: 'Run ended' })).toBeVisible();
  await expect(block(page)).toHaveAttribute('data-stage', 'settled', { timeout: 5_000 });
  await expect(page.getByText('2 stars this run · 50 minutes of focus')).toBeVisible();
  // Only its own Stardust, so just the total, as for a single result (no goal reached).
  await expect(page.getByTestId('reward-total')).toHaveText('✦+50 Stardust');
  // One sentence for a screen reader, in the summary's status.
  await expect(page.getByRole('status').first()).toContainText('Earned 50 Stardust.');

  await dismissResult(page);
  await expect.poll(() => stardustBalance(page)).toBe(50);
});

test('a run ended before any block finished has no moment and no tally', async ({ page }) => {
  await startRun(page, 'pom-empty');
  await page.getByRole('button', { name: 'End early' }).click();
  await page.getByRole('button', { name: 'End session' }).click();
  // Ending a block early ends the run: the usual early-ending result, nothing earned.
  await expect(page.getByRole('heading', { name: 'Session ended early' })).toBeVisible();
  await expect(page.getByTestId('reward-total')).toHaveCount(0);
  await expect(page.locator('[data-stage]')).toHaveCount(0);
});

test('a break reloaded mid-way has no moment and no error (PR 6, case 4)', async ({ page }) => {
  await startRun(page, 'pom-reload');
  await page.clock.fastForward('25:01');
  await expect(page.getByText('Block 1 done')).toBeVisible();
  await skipMoment(page);

  await page.reload();
  await goToTimer(page);
  await expect(page.getByRole('heading', { name: /break/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Block 1 done')).toHaveCount(0);
  await expect(page.locator('[data-stage]')).toHaveCount(0);
});
