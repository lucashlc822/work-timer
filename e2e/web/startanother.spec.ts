import { expect, test, type Page } from '@playwright/test';

import { dismissResult, expectSignedIn, signIn, skipMoment, stardustPill } from '../support/app';
import { startClockInThePast } from '../support/clock';
import { createUser } from '../support/users';

/**
 * Ways on from a finished session (session-complete redesign, PR 3): start the
 * same length again without the idle screen in between, or open the sky from
 * the result and come back to it.
 */

const finishASession = async (page: Page, name: string) => {
  const user = await createUser(name);
  await startClockInThePast(page);
  await page.goto('/');
  await signIn(page, user);
  await expectSignedIn(page);
  await page.getByRole('button', { name: 'Start 25 min' }).click();
  await expect(page.getByRole('timer')).toContainText('25:00');
  await page.clock.fastForward('25:01');
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
  await skipMoment(page);
};

test('Start another begins the same length again, and it finishes as a second star (PR 3, case 1)', async ({
  page,
}) => {
  await finishASession(page, 'another-start');
  await page.getByRole('button', { name: 'Start another · 25 min' }).click();
  await expect(page.getByRole('timer')).toContainText('25:00');
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeHidden();

  await page.clock.fastForward('25:01');
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
  await dismissResult(page);
  await expect(stardustPill(page)).toHaveText(/\b50 Stardust$/);
});

test('Done stays the focused button, and Enter on it goes to idle, not another session (PR 3, case 2)', async ({
  page,
}) => {
  await finishASession(page, 'another-focus');
  await expect(page.getByRole('button', { name: 'Done' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Start 25 min' })).toBeFocused();
  await expect(page.getByRole('timer')).toHaveCount(0);
});

test('See it in your sky opens the sky, and Back returns to the result on that button (PR 3, case 5)', async ({
  page,
}) => {
  await finishASession(page, 'another-sky');
  const link = page.getByRole('button', { name: 'See it in your sky' });
  await link.click();
  await expect(page.getByRole('button', { name: 'Back to timer' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to timer' }).click();
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
  await expect(link).toBeFocused();
});

test('an early ending offers neither (PR 3, case 4 in spirit)', async ({ page }) => {
  const user = await createUser('another-early');
  await startClockInThePast(page);
  await page.goto('/');
  await signIn(page, user);
  await expectSignedIn(page);
  await page.getByRole('button', { name: 'Start 25 min' }).click();
  await expect(page.getByRole('timer')).toContainText('25:00');
  await page.clock.fastForward('10:00');
  await page.getByRole('button', { name: 'End early' }).click();
  await page.getByRole('button', { name: 'End session' }).click();
  await expect(page.getByRole('heading', { name: 'Session ended early' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Start another/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'See it in your sky' })).toHaveCount(0);
});
