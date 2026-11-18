import { expect, test, type Page } from '@playwright/test';

import {
  expectSignedIn,
  focusButton,
  goHome,
  goToTimer,
  homeButton,
  openView,
  signIn,
  skipMoment,
} from '../support/app';
import { startClockInThePast } from '../support/clock';
import { befriend, createRoom, setName } from '../support/friends';
import { createUser } from '../support/users';

/**
 * Premium-motion PR 3: home is its own page. The app opens on it, the timer is
 * one press away, and a session in progress always finds its way back to the
 * timer page.
 */
test.use({ viewport: { width: 480, height: 720 } });

const mainNav = (page: Page) => page.getByRole('navigation', { name: 'Main' });
const timerTitle = (page: Page) => page.getByRole('heading', { name: 'Focus', level: 2 });

const signedIn = async (page: Page, label: string) => {
  const user = await createUser(label);
  await startClockInThePast(page);
  await page.goto('/');
  await signIn(page, user);
  await expectSignedIn(page);
  return user;
};

test('T1: a fresh sign-in opens home, with the navigation and Start focusing', async ({ page }) => {
  await signedIn(page, 'home-t1');
  await expect(mainNav(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start focusing' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Start \d+ min$/ })).toBeHidden();
});

test('T2: Start focusing opens the timer page on its title', async ({ page }) => {
  await signedIn(page, 'home-t2');
  await page.getByRole('button', { name: 'Start focusing' }).click();
  await expect(page.getByRole('button', { name: 'Start 25 min' })).toBeVisible();
  await expect(timerTitle(page)).toBeFocused();
  await expect(mainNav(page)).toBeHidden();
});

test('T3: Escape on the idle timer page goes home, onto Start focusing', async ({ page }) => {
  await signedIn(page, 'home-t3');
  await goToTimer(page);
  await page.keyboard.press('Escape');
  await expect(mainNav(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start focusing' })).toBeFocused();
});

test('T3b: Escape that closes the tag picker stays on the timer page', async ({ page }) => {
  await signedIn(page, 'home-t3b');
  await goToTimer(page);
  await page.getByRole('button', { name: 'No tag', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Choose a tag' });
  await expect(picker).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(picker).toBeHidden();
  await expect(homeButton(page)).toBeVisible();
});

test('T4: mid-session, Escape stays; home returns to focus and says how long is left', async ({
  page,
}) => {
  await signedIn(page, 'home-t4');
  await goToTimer(page);
  await page.getByRole('button', { name: 'Start 25 min' }).click();
  await expect(page.getByRole('timer')).toContainText('25:00');

  await page.keyboard.press('Escape');
  await expect(page.getByRole('timer')).toBeVisible();

  await homeButton(page).click();
  const cta = page.getByRole('button', { name: 'Return to focus' });
  await expect(cta).toBeFocused();
  await expect(page.getByText('Focusing · 25 min left')).toBeVisible();
  await expect(cta).toHaveAccessibleDescription('Focusing · 25 min left');

  await cta.click();
  await expect(page.getByRole('timer')).toBeVisible();
});

test('T5: a session that finishes while home brings the timer page and its moment back', async ({
  page,
}) => {
  await signedIn(page, 'home-t5');
  await goToTimer(page);
  await page.getByRole('button', { name: 'Start 25 min' }).click();
  await expect(page.getByRole('timer')).toContainText('25:00');
  await goHome(page);

  await page.clock.fastForward('25:01');
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
  await expect(homeButton(page)).toBeVisible();
  await expect(mainNav(page)).toBeHidden();
  // The moment plays now, not while the result was hidden on home.
  await expect(page.locator('[data-stage]')).not.toHaveAttribute('data-stage', 'settled');
  await skipMoment(page);
  await expect(page.locator('[data-stage]')).toHaveAttribute('data-stage', 'settled');
});

test('T6: a reload mid-session restores the timer page, not home', async ({ page }) => {
  await signedIn(page, 'home-t6');
  await goToTimer(page);
  await page.getByRole('button', { name: 'Start 25 min' }).click();
  await expect(page.getByRole('timer')).toContainText('25:00');

  await page.reload();
  await expect(page.getByRole('timer')).toBeVisible({ timeout: 15_000 });
  await expect(homeButton(page)).toBeVisible();
  await expect(mainNav(page)).toBeHidden();
});

test('T7: Stats opened from home goes back to home, onto Stats', async ({ page }) => {
  await signedIn(page, 'home-t7');
  await openView(page, 'Stats');
  await page.getByRole('button', { name: 'Back to home' }).click();
  await expect(page.getByRole('button', { name: 'Stats', exact: true })).toBeFocused();
});

test('T12: Start focusing is within four Tabs, and ten round trips never drop focus to the page', async ({
  page,
}) => {
  await signedIn(page, 'home-t12');
  const cta = focusButton(page);
  let reached = false;
  for (let i = 0; i < 4 && !reached; i++) {
    await page.keyboard.press('Tab');
    reached = await cta.evaluate((el) => el === document.activeElement);
  }
  expect(reached).toBe(true);

  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Enter');
    await expect(timerTitle(page)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(cta).toBeFocused();
  }
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
});

test.describe('with a friend', () => {
  // Real clock, as in together.spec.ts: a room's times are the server's.
  test('T8, T9: an invitation shows on home, and joining opens the lobby on the timer page', async ({
    page,
  }) => {
    const [ada, bea] = await Promise.all([createUser('home-ada'), createUser('home-bea')]);
    await Promise.all([setName(ada, 'Ada'), setName(bea, 'Bea')]);
    await befriend(ada, bea);
    await page.goto('/');
    await signIn(page, bea);
    await expect(mainNav(page)).toBeVisible({ timeout: 15_000 });

    await createRoom(ada, [bea], 1500);
    const banner = page.getByRole('region', { name: 'Invitation' });
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await banner.getByRole('button', { name: 'Join' }).click();

    await expect(page.getByText('Waiting for Ada to start.')).toBeVisible({ timeout: 15_000 });
    await expect(homeButton(page)).toBeVisible();
    await expect(mainNav(page)).toBeHidden();
  });
});
