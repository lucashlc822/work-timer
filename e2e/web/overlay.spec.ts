import { expect, test, type Page } from '@playwright/test';

import { dismissResult, goHome, goToTimer, signIn } from '../support/app';
import { startClockInThePast } from '../support/clock';
import { createUser } from '../support/users';

/**
 * Premium-motion PR 6: overlays come and go. A panel slides and fades in and
 * out, the one leaving is out of reach, focus goes back at once, and opening
 * the sky glides its constellation into place.
 */
test.use({ viewport: { width: 480, height: 720 } });

const signedIn = async (page: Page, label: string, withAStar = false) => {
  const user = await createUser(label);
  await startClockInThePast(page);
  await page.goto('/');
  await signIn(page, user);
  await goHome(page);
  if (withAStar) {
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
  }
};

const stats = (page: Page) => page.getByRole('button', { name: 'Stats', exact: true });

test('T1: a panel opens on its title and its layer animates in', async ({ page }) => {
  await signedIn(page, 'overlay-t1');
  await stats(page).click();
  const layer = page.locator('[data-overlay]').first();
  // Its own entrance is running (opacity and a small rise; no blur).
  expect(await layer.evaluate((el) => el.getAnimations().length)).toBeGreaterThan(0);
  expect(await layer.evaluate((el) => getComputedStyle(el).backdropFilter)).toBe('none');
  await expect(page.getByRole('heading', { name: 'Stats', level: 2 })).toBeFocused({
    timeout: 400,
  });
});

test('T2: closing gives focus back at once, while the panel is still leaving out of reach', async ({
  page,
}) => {
  await signedIn(page, 'overlay-t2');
  await stats(page).click();
  await expect(page.getByRole('heading', { name: 'Stats', level: 2 })).toBeFocused();
  await page.waitForTimeout(400);

  await page.keyboard.press('Escape');
  const during = await page.evaluate(() => {
    const layer = document.querySelector('[data-overlay]');
    return {
      leaving: layer !== null,
      inert: layer?.hasAttribute('inert') ?? null,
      focus: (document.activeElement as HTMLElement | null)?.textContent ?? null,
    };
  });
  expect(during.focus).toBe('Stats');
  if (during.leaving) expect(during.inert).toBe(true);
  await expect(stats(page)).toBeFocused({ timeout: 250 });
  await expect(page.locator('[data-overlay]')).toHaveCount(0);
});

test('T3: opening the sky glides its constellation into its cell', async ({ page }) => {
  await signedIn(page, 'overlay-t3', true);
  await page.getByRole('button', { name: 'View sky', exact: true }).click();
  const kite = page.locator('g[data-figure]').first();
  const transforms = await kite.evaluate(
    (g) =>
      g
        .getAnimations()
        .flatMap((a) => (a.effect as KeyframeEffect | null)?.getKeyframes() ?? [])
        .filter((k) => 'transform' in k).length,
  );
  expect(transforms).toBeGreaterThan(0);
  await expect.poll(() => kite.evaluate((g) => g.getAnimations().length)).toBe(0);
  expect(await kite.evaluate((g) => getComputedStyle(g).transform)).toBe('none');
});

test('T4: with reduced motion the sky fades in, nothing moves', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signedIn(page, 'overlay-t4', true);
  await page.getByRole('button', { name: 'View sky', exact: true }).click();
  const moving = await page.evaluate(
    () =>
      Array.from(document.querySelectorAll('g[data-figure]'))
        .flatMap((g) => g.getAnimations())
        .flatMap((a) => (a.effect as KeyframeEffect | null)?.getKeyframes() ?? [])
        .filter((k) => 'transform' in k).length,
  );
  expect(moving).toBe(0);
});

test('T5: opening and closing ten times quickly leaves one panel or none, never a stack', async ({
  page,
}) => {
  await signedIn(page, 'overlay-t5');
  for (let i = 0; i < 10; i++) {
    await stats(page).click();
    await page.keyboard.press('Escape');
  }
  await expect(page.locator('[data-overlay]')).toHaveCount(0);
  await expect(stats(page)).toBeFocused();
  await stats(page).click();
  await expect(page.locator('[data-overlay]')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Stats', level: 2 })).toBeFocused();
});
