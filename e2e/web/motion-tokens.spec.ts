import { expect, test, type Page } from '@playwright/test';

import { dismissResult, goHome, goToTimer, openView, signIn } from '../support/app';
import { startClockAtYesterdayNoon } from '../support/clock';
import { createUser } from '../support/users';

/**
 * UI review L3: durations come from the motion tokens, and only transform and
 * opacity animate. The daily-goal bar slides a full-width fill instead of
 * animating its width; the Switch takes `duration-enter` (240 ms).
 */
test.use({ viewport: { width: 480, height: 720 } });

const signedIn = async (page: Page, label: string) => {
  const user = await createUser(label);
  await startClockAtYesterdayNoon(page);
  await page.goto('/');
  await signIn(page, user);
  await goToTimer(page);
};

/** One 25-minute session done, so the goal bar reads 25 of 60. */
const withASession = async (page: Page, label: string) => {
  await signedIn(page, label);
  await page.getByRole('button', { name: 'Start 25 min' }).click();
  await expect(page.getByRole('timer')).toContainText('25:00');
  await page.clock.fastForward('25:01');
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
  await dismissResult(page);
};

const openGoal = async (page: Page) => {
  await goHome(page);
  await page.getByRole('button', { name: /Stardust$/ }).click();
  await page.getByRole('tab', { name: 'Goal & streak' }).click();
  await page.getByRole('region', { name: 'Daily goal and streak' }).waitFor();
};

const bar = (page: Page) =>
  page.getByRole('progressbar', { name: 'Progress toward the daily goal' });

/** The fill's visible right edge as a fraction of the track, and how it is animated. */
const fill = (page: Page) =>
  bar(page).evaluate((track) => {
    const fillEl = track.firstElementChild as HTMLElement;
    const t = track.getBoundingClientRect();
    const f = fillEl.getBoundingClientRect();
    const cs = getComputedStyle(fillEl);
    return {
      shown: (f.right - t.left) / t.width,
      property: cs.transitionProperty,
      duration: cs.transitionDuration,
    };
  });

test('B2: the goal bar slides to 25 of 60 by transform, and ends within 1 px of it', async ({
  page,
}) => {
  await withASession(page, 'mt-b2');
  await openGoal(page);
  await page.waitForTimeout(800);
  const f = await fill(page);
  expect(f.property).toContain('transform');
  expect(f.property).not.toContain('width');
  expect(f.duration).toBe('0.45s');
  const trackWidth = await bar(page).evaluate((el) => el.getBoundingClientRect().width);
  expect(Math.abs(f.shown - 25 / 60) * trackWidth).toBeLessThan(1);
  await expect(bar(page)).toHaveAttribute('aria-valuenow', '25');
});

test('B2b: a longer goal moves the fill, and nothing animates its width', async ({ page }) => {
  await withASession(page, 'mt-b2b');
  await openGoal(page);
  await page.waitForTimeout(800);
  const before = (await fill(page)).shown;
  await page.getByRole('button', { name: /Lower the goal by/ }).click();
  await page.waitForTimeout(800);
  const after = await fill(page);
  // A lower goal fills more of the bar (25 of 55 is more than 25 of 60).
  expect(after.shown).toBeGreaterThan(before);
  const widthAnimations = await bar(page).evaluate((track) =>
    (track.firstElementChild as HTMLElement)
      .getAnimations()
      .filter((a) => a instanceof CSSTransition && a.transitionProperty === 'width'),
  );
  expect(widthAnimations.length).toBe(0);
});

test('B3: with reduced motion the bar is at its value at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await withASession(page, 'mt-b3');
  await openGoal(page);
  const f = await fill(page);
  expect(parseFloat(f.duration)).toBeLessThan(0.001);
  const trackWidth = await bar(page).evaluate((el) => el.getBoundingClientRect().width);
  expect(Math.abs(f.shown - 25 / 60) * trackWidth).toBeLessThan(1);
});

test('B4: the Switch toggles by click and by Space, and moves over 240 ms', async ({ page }) => {
  await signedIn(page, 'mt-b4');
  await openView(page, 'Account');
  const sound = page.getByRole('checkbox', { name: 'Completion sound' });
  await expect(sound).toBeChecked();
  await sound.click();
  await expect(sound).not.toBeChecked();
  await sound.focus();
  await page.keyboard.press('Space');
  await expect(sound).toBeChecked();
  // The track is the sibling the checkbox styles (peer); its duration is the token's.
  const duration = await sound.evaluate((input) => {
    const track = input.nextElementSibling as HTMLElement;
    return getComputedStyle(track).transitionDuration;
  });
  expect(duration).toBe('0.24s');
});
