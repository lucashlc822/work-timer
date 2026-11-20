import { expect, test, type Page } from '@playwright/test';

import { goHome, homeButton, signIn } from '../support/app';
import { startClockInThePast } from '../support/clock';
import { createUser } from '../support/users';

/**
 * Premium-motion PR 7: home's call to action grows into the timer card, and
 * the card shrinks back into it. A temporary surface does the morph; the real
 * card's contents arrive under it.
 */
test.use({ viewport: { width: 480, height: 720 } });

const surface = (page: Page) => page.locator('[data-morph-surface]');
const card = (page: Page) => page.locator('[data-timer-card]');
const surfaceShown = (page: Page) =>
  surface(page).evaluate((el) => getComputedStyle(el).display !== 'none');

const signedIn = async (page: Page, label: string) => {
  const user = await createUser(label);
  await startClockInThePast(page);
  await page.goto('/');
  await signIn(page, user);
  await goHome(page);
  await page.waitForTimeout(300);
};

test('T1: Start focusing grows into the card, then the surface leaves the real card behind', async ({
  page,
}) => {
  await signedIn(page, 'morph-t1');
  await page.getByRole('button', { name: 'Start focusing' }).click();
  await expect.poll(() => surfaceShown(page), { timeout: 400 }).toBe(true);
  // While it grows, its clip is animating and the card is still arriving.
  expect(await surface(page).evaluate((el) => el.getAnimations().length)).toBeGreaterThan(0);

  await expect.poll(() => surfaceShown(page), { timeout: 1500 }).toBe(false);
  await expect(card(page)).toBeVisible();
  expect(await card(page).evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  expect(await card(page).evaluate((el) => el.getAnimations().length)).toBe(0);
});

test('T2: by keyboard too, and the timer page lands on its title', async ({ page }) => {
  await signedIn(page, 'morph-t2');
  const cta = page.getByRole('button', { name: 'Start focusing' });
  await cta.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => surfaceShown(page), { timeout: 400 }).toBe(true);
  await expect(page.getByRole('heading', { name: 'Focus', level: 2 })).toBeFocused();
  await expect.poll(() => surfaceShown(page), { timeout: 1500 }).toBe(false);
});

test('T3: back home, the card shrinks into the button, which is there and focused at the end', async ({
  page,
}) => {
  await signedIn(page, 'morph-t3');
  await page.getByRole('button', { name: 'Start focusing' }).click();
  await expect.poll(() => surfaceShown(page), { timeout: 1500 }).toBe(false);
  await homeButton(page).click();
  await expect.poll(() => surfaceShown(page), { timeout: 400 }).toBe(true);
  await expect.poll(() => surfaceShown(page), { timeout: 1500 }).toBe(false);
  const cta = page.getByRole('button', { name: 'Start focusing' });
  await expect(cta).toBeFocused();
  expect(await cta.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
});

test('T4: with reduced motion nothing morphs; the card just fades in', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signedIn(page, 'morph-t4');
  await page.getByRole('button', { name: 'Start focusing' }).click();
  for (let i = 0; i < 5; i++) {
    expect(await surfaceShown(page)).toBe(false);
    await page.waitForTimeout(60);
  }
  await expect(card(page)).toBeVisible();
});

test('T5: mid-session there is no card to meet: no morph, and nothing runs while the timer ticks', async ({
  page,
}) => {
  await signedIn(page, 'morph-t5');
  await page.getByRole('button', { name: 'Start focusing' }).click();
  await expect.poll(() => surfaceShown(page), { timeout: 1500 }).toBe(false);
  await page.getByRole('button', { name: 'Start 25 min' }).click();
  await expect(page.getByRole('timer')).toContainText('25:00');

  await homeButton(page).click();
  expect(await surfaceShown(page)).toBe(false);
  await page.getByRole('button', { name: 'Return to focus' }).click();
  expect(await surfaceShown(page)).toBe(false);
  await expect(page.getByRole('timer')).toBeVisible();

  // Over three seconds of countdown, the morph adds no animation anywhere.
  await page.waitForTimeout(400);
  const mine = () =>
    page.evaluate(
      () =>
        document
          .getAnimations()
          .filter((a) =>
            (a.effect as KeyframeEffect | null)?.target?.matches?.(
              '[data-morph-surface], [data-timer-card]',
            ),
          ).length,
    );
  for (let i = 0; i < 3; i++) {
    expect(await mine()).toBe(0);
    await page.waitForTimeout(1000);
  }
});
