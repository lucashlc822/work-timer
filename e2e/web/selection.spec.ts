import { expect, test, type Page } from '@playwright/test';

import { dismissResult, goHome, goToTimer, signIn } from '../support/app';
import { startClockInThePast } from '../support/clock';
import { createUser } from '../support/users';

/**
 * Premium-motion PR 9: a highlight slides to the selected option, the planned
 * time's changed digits roll, and the Stardust balance counts to its new value.
 * The running countdown never animates.
 */
test.use({ viewport: { width: 480, height: 720 } });

const signedIn = async (page: Page, label: string) => {
  const user = await createUser(label);
  await startClockInThePast(page);
  await page.goto('/');
  await signIn(page, user);
  await goToTimer(page);
  await page.waitForTimeout(300);
};

const radio = (page: Page, name: string) => page.getByRole('radio', { name, exact: true });

test('T1: the highlight glides to the chosen length, lands on it, and aria-checked flips at once', async ({
  page,
}) => {
  await signedIn(page, 'sel-t1');
  await radio(page, '90 min').click();
  await expect(radio(page, '90 min')).toBeChecked();
  const indicator = page.locator(
    '[role="radiogroup"][aria-label="Session length"] > span[aria-hidden]',
  );
  // A transform animation is carrying it there...
  expect(await indicator.evaluate((el) => el.getAnimations().length)).toBeGreaterThan(0);
  // ...and it ends exactly over the new segment.
  await expect.poll(() => indicator.evaluate((el) => el.getAnimations().length)).toBe(0);
  const lit = await indicator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  const seg = await radio(page, '90 min').evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  for (const k of ['x', 'y', 'w', 'h'] as const) expect(Math.abs(lit[k] - seg[k])).toBeLessThan(1);
});

test('T2: arrow keys still move and select, wrapping, with focus following', async ({ page }) => {
  await signedIn(page, 'sel-t2');
  await radio(page, '25 min').focus();
  await page.keyboard.press('ArrowRight');
  await expect(radio(page, '50 min')).toBeFocused();
  await expect(radio(page, '50 min')).toBeChecked();
  await page.keyboard.press('ArrowLeft');
  await expect(radio(page, '25 min')).toBeChecked();
});

test('T3: dragging the Custom slider rolls at most the first change, then digits change at once', async ({
  page,
}) => {
  await signedIn(page, 'sel-t3');
  await radio(page, 'Custom').click();
  const slider = page.getByRole('slider', { name: 'Custom session length in minutes' });
  await expect(slider).toBeVisible();
  await slider.focus();
  await page.waitForTimeout(500);
  // Held-down arrow: a stream of changes closer together than 150 ms. Only the
  // first of them (after the pause) may roll its changed digits; the rest don't.
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
  const rolling = await page.evaluate(
    () =>
      Array.from(document.querySelectorAll('p[aria-hidden] span span')).flatMap((s) =>
        s.getAnimations(),
      ).length,
  );
  expect(rolling).toBeLessThanOrEqual(2);
});

test('T4: a changed length rolls only the digits that changed', async ({ page }) => {
  await signedIn(page, 'sel-t4');
  await radio(page, '50 min').click();
  const rolled = await page.evaluate(() =>
    Array.from(document.querySelectorAll('p[aria-hidden] > span > span')).map(
      (s) => s.getAnimations().length > 0,
    ),
  );
  // "25:00" -> "50:00": the 2 and the 5 roll, the colon and zeros stay.
  expect(rolled.slice(0, 2)).toEqual([true, true]);
  expect(rolled.slice(2)).toEqual([false, false, false]);
});

test('T5: the running countdown has no animation on it, over several seconds', async ({ page }) => {
  await signedIn(page, 'sel-t5');
  await page.getByRole('button', { name: 'Start 25 min' }).click();
  await expect(page.getByRole('timer')).toContainText('25:00');
  await page.waitForTimeout(600);
  for (let i = 0; i < 4; i++) {
    const n = await page
      .getByRole('timer')
      .evaluate(
        (el) =>
          [el, ...Array.from(el.querySelectorAll('*'))].flatMap((e) => e.getAnimations()).length,
      );
    expect(n).toBe(0);
    await page.waitForTimeout(1000);
  }
});

test('T6: reduced motion: the highlight and digits just change', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signedIn(page, 'sel-t6');
  await radio(page, '90 min').click();
  const anims = await page.evaluate(
    () =>
      Array.from(
        document.querySelectorAll(
          '[role="radiogroup"] > span[aria-hidden], p[aria-hidden] span span',
        ),
      )
        .flatMap((e) => e.getAnimations())
        // Reduced motion makes every style change a 0.01 ms CSS transition; not motion.
        .filter((a) => !(a instanceof CSSTransition)).length,
  );
  expect(anims).toBe(0);
});

test('T7: finishing a session counts the Stardust balance up to its new total', async ({
  page,
}) => {
  await signedIn(page, 'sel-t7');
  await page.getByRole('button', { name: 'Start 25 min' }).click();
  await expect(page.getByRole('timer')).toContainText('25:00');
  await page.clock.fastForward('25:01');
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
  await dismissResult(page);
  await goHome(page);
  const tile = page.getByRole('button', { name: /Stardust$/ });
  // The accessible name is the real balance from the first frame...
  await expect(tile).toHaveAccessibleName('25 Stardust');
  // ...and the visible number settles on it.
  await expect(tile).toHaveText(/\b25\s*Stardust$/);
  await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
});
