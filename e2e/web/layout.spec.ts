import { expect, test, type Page } from '@playwright/test';

import { expectSignedIn, openAccount, signIn } from '../support/app';
import { startClockInThePast } from '../support/clock';
import { createUser } from '../support/users';

/**
 * The desktop app opens at 480x720 (`src-tauri/tauri.conf.json`), so this size is
 * what most desktop users see every day, not an edge case.
 */
test.use({ viewport: { width: 480, height: 720 } });

const signedIn = async (page: Page, label: string) => {
  const user = await createUser(label);
  await startClockInThePast(page);
  await page.goto('/');
  await signIn(page, user);
  await expectSignedIn(page);
};

test('the idle screen fits the desktop app’s default window without scrolling', async ({
  page,
}) => {
  await signedIn(page, 'layout-fit');
  // The hint, the goal line and the footer's constellation button arrive after the
  // first paint; measure only once the page is as tall as it is going to be.
  await expect(page.getByText(/^Today \d+ of \d+ min/)).toBeVisible();
  await expect(page.getByText(/wandering star|Adds star|Won.t count/)).toBeVisible();
  await expect(page.getByRole('button', { name: /constellation/i })).toBeVisible();
  const start = await page.getByRole('button', { name: 'Start 25 min' }).boundingBox();
  const page_ = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
  }));

  expect(page_.scrollHeight).toBeLessThanOrEqual(page_.clientHeight);
  expect((start?.y ?? 0) + (start?.height ?? 0)).toBeLessThanOrEqual(720);
});

test('Account’s version line is in the readable text colour', async ({ page }) => {
  await signedIn(page, 'layout-version');
  await openAccount(page);
  const colour = await page
    .getByText(/^\S+ \d+\.\d+\.\d+$/)
    .evaluate((el) => getComputedStyle(el).color);

  // --color-ink-secondary; ink-muted (#817a9f) fails axe's contrast mid-fade.
  expect(colour).toBe('rgb(185, 178, 212)');
});
