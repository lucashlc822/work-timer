import { expect, test, type Page } from '@playwright/test';

import { goHome, signIn } from '../support/app';
import { startClockInThePast } from '../support/clock';
import { createUser } from '../support/users';

/**
 * UI review L5: the constellation picker's Close button had a square focus ring
 * (no radius) unlike every pill button elsewhere, and the list scrolled with a
 * native light scrollbar on a dark page. Close is a pill now, and scrollbars
 * take the night-600 token everywhere.
 */
test.use({ viewport: { width: 1280, height: 800 } });

const openPicker = async (page: Page, label: string) => {
  const user = await createUser(label);
  await startClockInThePast(page);
  await page.goto('/');
  await signIn(page, user);
  await goHome(page);
  await page.getByRole('button', { name: 'Choose a constellation' }).click();
  const dialog = page.getByRole('dialog', { name: 'Choose a constellation' });
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(500);
  return dialog;
};

test('D1: Close is a pill, so its focus ring is rounded like the other buttons', async ({
  page,
}) => {
  const dialog = await openPicker(page, 'pp-d1');
  const close = dialog.getByRole('button', { name: 'Close' });
  // By keyboard, like a real user: a script's focus() shows no ring after a mouse click.
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(close).toBeFocused();
  const look = await close.evaluate((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      radius: parseFloat(cs.borderTopLeftRadius),
      height: r.height,
      outlineStyle: cs.outlineStyle,
      outlineWidth: cs.outlineWidth,
    };
  });
  // A pill: the radius is at least half the height (999px from the token).
  expect(look.radius).toBeGreaterThanOrEqual(look.height / 2);
  // The global focus ring (2px solid lavender) still shows.
  expect(look.outlineStyle).toBe('solid');
  expect(look.outlineWidth).toBe('2px');
  // A pressable target, at least 24 px tall (WCAG 2.2 target size).
  expect(look.height).toBeGreaterThanOrEqual(24);
});

test('D2: scrollbars use the night-600 token on the page and in the picker', async ({ page }) => {
  const dialog = await openPicker(page, 'pp-d2');
  const colours = await dialog.evaluate((el) => {
    const list = el.querySelector('.overflow-y-auto') as HTMLElement;
    return {
      list: getComputedStyle(list).scrollbarColor,
      listWidth: getComputedStyle(list).scrollbarWidth,
      page: getComputedStyle(document.documentElement).scrollbarColor,
    };
  });
  // --color-night-600 is #2d2557 = rgb(45, 37, 87), on a transparent track.
  expect(colours.list).toContain('rgb(45, 37, 87)');
  expect(colours.page).toContain('rgb(45, 37, 87)');
  expect(colours.listWidth).toBe('thin');
});

test('D1b: the picker still closes by its button and by Escape, and returns focus', async ({
  page,
}) => {
  const dialog = await openPicker(page, 'pp-d1b');
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Choose a constellation' })).toBeFocused();
  await page.getByRole('button', { name: 'Choose a constellation' }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
