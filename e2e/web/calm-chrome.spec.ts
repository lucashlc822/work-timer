import { expect, test, type Locator, type Page } from '@playwright/test';

import { expectSignedIn, openView, signIn, stardustPill } from '../support/app';
import { startClockInThePast } from '../support/clock';
import { createUser } from '../support/users';

/**
 * Premium-motion PR 2: everyday chrome moves briefly and calmly. A button gives
 * under a press, a tab's content fades in, and reduced motion removes the
 * movement.
 */
test.use({ viewport: { width: 480, height: 720 } });

const signedIn = async (page: Page, label: string) => {
  const user = await createUser(label);
  await startClockInThePast(page);
  await page.goto('/');
  await signIn(page, user);
  await expectSignedIn(page);
};

const transformOf = (el: Locator) => el.evaluate((node) => getComputedStyle(node).transform);

test('T1: a pressed button scales to 0.97 and releases back', async ({ page }) => {
  await signedIn(page, 'calm-press');
  const start = page.getByRole('button', { name: 'Start 25 min' });
  const box = (await start.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(() => transformOf(start)).toBe('matrix(0.97, 0, 0, 0.97, 0, 0)');
  // Release away from the button, so the press never becomes a click (a Start).
  await page.mouse.move(box.x - 40, box.y - 40);
  await page.mouse.up();
  await expect.poll(() => transformOf(start)).toBe('none');
  await expect(start).toBeVisible();
});

test('T2: reduced motion removes the press movement’s duration', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signedIn(page, 'calm-reduced');
  const start = page.getByRole('button', { name: 'Start 25 min' });
  const longest = await start.evaluate((node) =>
    Math.max(
      ...getComputedStyle(node)
        .transitionDuration.split(',')
        .map((d) => parseFloat(d) * (d.trim().endsWith('ms') ? 1 : 1000)),
    ),
  );
  expect(longest).toBeLessThan(1);
});

test('T3: a Stardust tab’s content fades in when the tab opens', async ({ page }) => {
  await signedIn(page, 'calm-tabs');
  await stardustPill(page).click();
  const goal = page.getByRole('tab', { name: /goal/i });
  await goal.click();
  const panel = page
    .getByRole('tabpanel')
    .filter({ has: page.getByText(/goal/i) })
    .first();
  await expect(panel).toBeVisible();
  expect(await panel.evaluate((node) => getComputedStyle(node).animationName)).toBe('fade-in');
  // The tab list's keyboard pattern is intact.
  await expect(goal).toHaveAttribute('aria-selected', 'true');
  await expect(goal).toHaveAttribute('aria-controls', /.+/);
});

test('T3b: the Stats panel fades in too', async ({ page }) => {
  await signedIn(page, 'calm-stats');
  await openView(page, 'Stats');
  const panel = page.getByRole('tabpanel').first();
  await expect(panel).toBeVisible();
  expect(await panel.evaluate((node) => getComputedStyle(node).animationName)).toBe('fade-in');
});
