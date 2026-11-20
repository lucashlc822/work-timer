import { expect, test, type Page } from '@playwright/test';

import { dismissResult, goHome, goToTimer, openView, signIn } from '../support/app';
import { startClockInThePast } from '../support/clock';
import { createUser } from '../support/users';

/**
 * UI review L4: the home constellation showed faintly through the open panels
 * (they are 92% opaque, with no blur). While a panel is open the figure fades
 * out; the starfield stays, and View sky, which is the figure's own stage,
 * keeps it.
 */
test.use({ viewport: { width: 1280, height: 800 } });

const withAStar = async (page: Page, label: string) => {
  const user = await createUser(label);
  await startClockInThePast(page);
  await page.goto('/');
  await signIn(page, user);
  await goHome(page);
  await page.getByRole('button', { name: 'Choose a constellation' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^The Kite/ })
    .click();
  await goToTimer(page);
  await page.getByRole('button', { name: 'Start 25 min' }).click();
  await expect(page.getByRole('timer')).toContainText('25:00');
  await page.clock.fastForward('25:01');
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
  await dismissResult(page);
  await goHome(page);
};

/** The hero figure's layer: the svg that holds `data-hero-box`. */
const heroLayer = (page: Page) => page.locator('svg:has([data-hero-box])').first();

const opacity = (page: Page) =>
  heroLayer(page).evaluate((el) => Number(getComputedStyle(el).opacity));

const settle = (page: Page) => page.waitForTimeout(700);

test('C1: Stats hides the home constellation, and Back brings it back', async ({ page }) => {
  await withAStar(page, 'hh-c1');
  await settle(page);
  expect(await opacity(page)).toBe(1);

  await openView(page, 'Stats');
  await settle(page);
  expect(await opacity(page)).toBe(0);

  await page.getByRole('button', { name: 'Back to home' }).click();
  await settle(page);
  expect(await opacity(page)).toBe(1);
});

test('C1b: Stardust, Account and Friends hide it too', async ({ page }) => {
  await withAStar(page, 'hh-c1b');
  await settle(page);
  await page.getByRole('button', { name: /Stardust$/ }).click();
  await settle(page);
  expect(await opacity(page), 'Stardust').toBe(0);
  await page.getByRole('button', { name: 'Back to home' }).click();
  await settle(page);

  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await settle(page);
  expect(await opacity(page), 'Account').toBe(0);
  await page.getByRole('button', { name: 'Back to home' }).click();
  await settle(page);

  await page.getByRole('button', { name: /^Friends/ }).click();
  await settle(page);
  expect(await opacity(page), 'Friends').toBe(0);
});

test('C1c: the starfield is still there behind an open panel', async ({ page }) => {
  await withAStar(page, 'hh-c1c');
  await openView(page, 'Stats');
  await settle(page);
  // Only the figure fades: the ambient canvas keeps painting behind the panel.
  const canvasOpacity = await page
    .locator('canvas')
    .first()
    .evaluate((el) => Number(getComputedStyle(el).opacity));
  expect(canvasOpacity).toBeGreaterThan(0);
});

test('C2: View sky keeps the figure, and leaving it keeps it on home', async ({ page }) => {
  await withAStar(page, 'hh-c2');
  await openView(page, 'View sky');
  await expect(page.locator('[data-hero-hidden]')).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Your sky' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to home' }).click();
  await settle(page);
  expect(await opacity(page)).toBe(1);
});

test('C4: with reduced motion the figure is gone at once, with no animation on it', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await withAStar(page, 'hh-c4');
  await openView(page, 'Stats');
  await page.waitForTimeout(100);
  expect(await opacity(page)).toBe(0);
  const animations = await heroLayer(page).evaluate(
    (el) =>
      // Reduced motion makes every style change a 0.01 ms CSS transition; not motion.
      el.getAnimations({ subtree: true }).filter((a) => !(a instanceof CSSTransition)).length,
  );
  expect(animations).toBe(0);
});
