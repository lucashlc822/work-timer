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

const finishTaggedSession = async (page: Page, tagName: string, constellation?: string) => {
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

  if (constellation !== undefined) {
    await page.getByRole('button', { name: 'Choose a constellation' }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: new RegExp(`^${constellation}`) })
      .click();
  }

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

test('a constellation’s caption opens its card from the keyboard, and is a big enough target (4.2, 4.6)', async ({
  page,
}) => {
  await finishTaggedSession(page, 'Writing', 'The Arrow');

  const caption = page.getByRole('img', { name: /^The Arrow, 1 of / });
  await expect(caption).toBeVisible();

  // 4.6: a target at least 24 by 24 CSS pixels.
  const box = await caption.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(24);
  expect(box!.height).toBeGreaterThanOrEqual(24);

  // 4.2: reached with the keyboard. A constellation is one Tab stop, its caption:
  // from Back it is one stop back, and its star is not a stop of its own.
  await expect(page.getByRole('button', { name: 'Back to timer' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(caption).toBeFocused();
  const card = page.getByTestId('constellation-card');
  await expect(card).toBeVisible();
  await expect(card).toContainText('The Arrow');
  await expect(card).toContainText(/1 of \d+ stars/);
  await expect(card).toContainText('Started ');
  await expect(card).toContainText('25 minutes of focus');

  // The arrow keys reach its star, whose card takes over; Left goes back.
  await page.keyboard.press('ArrowRight');
  await expect(theStar(page)).toBeFocused();
  await expect(page.getByTestId('star-card')).toBeVisible();
  await expect(page.getByTestId('star-card')).toContainText('Writing');
  await page.keyboard.press('ArrowLeft');
  await expect(caption).toBeFocused();
  await expect(card).toBeVisible();

  // First Escape closes the card, second leaves the sky.
  await page.keyboard.press('Escape');
  await expect(card).toBeHidden();
  await expect(page.getByRole('button', { name: 'Back to timer' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /^Start / })).toBeVisible();
});

/** A new person who finishes all four stars of the Kite from the timer, never opening the sky. */
const finishTheKite = async (page: Page) => {
  const user = await createUser('sky-complete');
  await startClockInThePast(page);
  await page.goto('/');
  await signIn(page, user);
  await expectSignedIn(page);

  await page.getByRole('button', { name: 'Choose a constellation' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^The Kite/ })
    .click();
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: 'Start 25 min' }).click();
    await expect(page.getByRole('timer')).toContainText('25:00');
    await page.clock.fastForward('25:01');
    await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();
  }
};

const kiteFigure = (page: Page) => page.locator('[data-figure][aria-label^="The Kite, complete"]');

test('a constellation finished from the timer gets its moment when the sky opens, once, and never again (6.2)', async ({
  page,
}) => {
  await finishTheKite(page);

  await openView(page, 'View sky');
  const figure = kiteFigure(page);
  await expect(figure).toBeVisible();
  // The lines draw in, the figure traces itself, a bloom swells, the stars flare.
  await expect(figure.locator('line.sky-draw')).toHaveCount(4);
  await expect(figure.locator('[data-atlas] path.sky-draw').first()).toBeAttached();
  await expect(figure.locator('[data-celebration="bloom"]')).toHaveCount(1);
  await expect(figure.locator('.sky-flare')).toHaveCount(4);
  await expect(page.getByTestId('sky-announcer')).toHaveText('The Kite is complete.');

  // Reopening the sky, and reloading the page: it does not play again.
  await page.getByRole('button', { name: 'Back to timer' }).click();
  await openView(page, 'View sky');
  await expect(figure).toBeVisible();
  await expect(figure.locator('.sky-draw, .sky-bloom, .sky-flare')).toHaveCount(0);

  await page.reload();
  await expectSignedIn(page);
  await openView(page, 'View sky');
  await expect(kiteFigure(page)).toBeVisible();
  await expect(kiteFigure(page).locator('.sky-draw, .sky-bloom, .sky-flare')).toHaveCount(0);
  await expect(page.getByTestId('sky-announcer')).toHaveText('');
});

test('with reduced motion the moment shows its final state at once, and is still announced (6.6)', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await finishTheKite(page);

  await openView(page, 'View sky');
  const figure = kiteFigure(page);
  await expect(figure.locator('line.sky-draw')).toHaveCount(4);
  await expect(page.getByTestId('sky-announcer')).toHaveText('The Kite is complete.');

  // No waiting: no delay, an instant animation, and every line already fully drawn.
  const lines = await figure.locator('line.sky-draw').evaluateAll((els) =>
    els.map((el) => {
      const cs = getComputedStyle(el);
      return {
        delay: cs.animationDelay,
        duration: cs.animationDuration,
        offset: cs.strokeDashoffset,
      };
    }),
  );
  for (const line of lines) {
    expect(line.delay).toBe('0s');
    expect(parseFloat(line.duration)).toBeLessThan(0.001);
    expect(parseFloat(line.offset)).toBe(0);
  }
});
