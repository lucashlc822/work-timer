import { expect, test, type Page } from '@playwright/test';

import { expectSignedIn, openTagPicker, openView, signIn } from '../support/app';
import { startClockInThePast } from '../support/clock';
import { createUser } from '../support/users';

/**
 * The star card (View sky upgrade PR 3): hovering or focusing a star in the full
 * sky shows when it was earned, for how long, its tag and its style, in place of
 * the browser's own tooltip. Escape closes the card first and only a second
 * press leaves the sky.
 *
 * One real tagged session, carried to its end by the page's clock (which starts
 * in the past, so the session is never "from the future" to the server).
 */

const card = (page: Page) => page.getByTestId('star-card');
/** No constellation was chosen, so the session's star wanders. */
const theStar = (page: Page) => page.getByRole('img', { name: /star from/i }).first();

const finishTaggedSession = async (page: Page, tagName: string) => {
  const user = await createUser('sky-card');
  await startClockInThePast(page);
  await page.goto('/');
  await signIn(page, user);
  await expectSignedIn(page);

  const panel = await openTagPicker(page);
  await panel.getByRole('textbox', { name: 'New tag name' }).fill(tagName);
  await panel.getByRole('button', { name: 'Add' }).click();
  if (await panel.isVisible()) await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: tagName, exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Start 25 min' }).click();
  // Wait until it is really running before moving the clock on.
  await expect(page.getByRole('timer')).toContainText('25:00');
  await page.clock.fastForward('25:01');
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();

  await openView(page, 'View sky');
  await expect(theStar(page)).toBeVisible();
};

test('hovering a star shows its card, which can be reached and stays while it is (3.1, 3.4)', async ({
  page,
}) => {
  await finishTaggedSession(page, 'Deep work');

  // No browser tooltip any more: the card replaces it.
  await expect(page.locator('svg[aria-label="Your sky"] title')).toHaveCount(0);

  await theStar(page).hover();
  await expect(card(page)).toBeVisible();
  await expect(card(page)).toContainText('Deep work');
  await expect(card(page)).toContainText('25 minutes');
  await expect(card(page)).toContainText('Classic star');

  // Move onto the card: it stays (WCAG 1.4.13, hoverable).
  const box = await card(page).boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2, { steps: 6 });
  await page.waitForTimeout(600);
  await expect(card(page)).toBeVisible();

  // Away from both: it goes.
  await page.mouse.move(4, 4, { steps: 4 });
  await expect(card(page)).toBeHidden();
});

test('a focused star shows its card; Escape closes it, and only a second Escape leaves the sky (3.2, 3.3)', async ({
  page,
}) => {
  await finishTaggedSession(page, 'Reading');

  // The Back button has focus on arrival; the star is the stop before it.
  await expect(page.getByRole('button', { name: 'Back to timer' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(theStar(page)).toBeFocused();
  await expect(card(page)).toBeVisible();
  await expect(card(page)).toContainText('Reading');

  // The focus ring shows without a mouse.
  const ringOpacity = await theStar(page).evaluate((g) => {
    const rings = Array.from(g.querySelectorAll('circle')).filter((c) =>
      (c.getAttribute('class') ?? '').includes('group-focus-visible'),
    );
    return rings.length === 0 ? null : getComputedStyle(rings[0] as Element).opacity;
  });
  expect(ringOpacity).toBe('1');

  // First Escape: the card goes, the sky stays.
  await page.keyboard.press('Escape');
  await expect(card(page)).toBeHidden();
  await expect(page.getByRole('button', { name: 'Back to timer' })).toBeVisible();

  // Second Escape: back to the timer, focus on the button that opened the sky.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /^Start / })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View sky', exact: true })).toBeFocused();
});
