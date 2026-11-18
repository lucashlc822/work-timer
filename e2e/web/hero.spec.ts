import { expect, test, type Page } from '@playwright/test';

import { dismissResult, goHome, goToTimer, signIn, skipMoment } from '../support/app';
import { startClockInThePast } from '../support/clock';
import { createUser } from '../support/users';

/**
 * Premium-motion PR 4: on the timer page the constellation has its own space
 * above the card, so the card never covers it (the red box in the 0.10.0
 * screenshot). The hero's box is read from `data-hero-box` ("x,y,size").
 */

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const heroBox = async (page: Page): Promise<Box | null> => {
  const raw = await page
    .locator('[data-hero-box]')
    .first()
    .getAttribute('data-hero-box', { timeout: 2_000 })
    .catch(() => null);
  if (raw === null) return null;
  const [x, y, size] = raw.split(',').map(Number) as [number, number, number];
  return { x, y, w: size, h: size };
};

/** What the timer page shows: the first child of its visible section. */
const timerContent = async (page: Page): Promise<Box> => {
  const box = await page.locator('main section:not([hidden]) > *').first().boundingBox();
  expect(box).not.toBeNull();
  return { x: box!.x, y: box!.y, w: box!.width, h: box!.height };
};

const slotBox = async (page: Page): Promise<Box> => {
  const box = await page.locator('[data-hero-slot]').boundingBox();
  return box === null
    ? { x: 0, y: 0, w: 0, h: 0 }
    : { x: box.x, y: box.y, w: box.width, h: box.height };
};

const inside = (a: Box, b: Box) =>
  a.x >= b.x - 1 && a.y >= b.y - 1 && a.x + a.w <= b.x + b.w + 1 && a.y + a.h <= b.y + b.h + 1;

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** A new person with the Kite chosen and one star in it, on the timer page. */
const withAHero = async (page: Page, label: string) => {
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
  await expect(page.getByRole('button', { name: 'Start 25 min' })).toBeVisible();
};

/** Waits for the hero's glide to finish, then reads where it is. */
const settledHero = async (page: Page) => {
  await page.waitForTimeout(700);
  return heroBox(page);
};

for (const size of [
  { width: 480, height: 720 },
  { width: 1280, height: 800 },
  { width: 1920, height: 1080 },
]) {
  test(`T1: at ${size.width}x${size.height} the hero never meets the card, idle, running or finished`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await withAHero(page, `hero-${size.width}`);

    // Idle leaves the card room to grow, so a short window may have no hero here.
    const idle = await settledHero(page);
    if (idle !== null) expect(overlaps(idle, await timerContent(page))).toBe(false);

    await page.getByRole('button', { name: 'Start 25 min' }).click();
    await expect(page.getByRole('timer')).toContainText('25:00');
    const running = await settledHero(page);
    expect(running).not.toBeNull();
    expect(overlaps(running!, await timerContent(page))).toBe(false);
    // The running countdown is small, so the constellation gets more room.
    expect(running!.w).toBeGreaterThan(idle?.w ?? 0);

    await page.clock.fastForward('25:01');
    await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
    await skipMoment(page);
    // A result with no room above it keeps the hero behind it, as before slots
    // (so a finished constellation's moment is still seen); in its slot, it's clear.
    const result = await settledHero(page);
    if (result !== null && inside(result, await slotBox(page))) {
      expect(overlaps(result, await timerContent(page))).toBe(false);
    }
  });
}

test('T2: at 380x560 the idle timer page draws no hero, or one clear of the card', async ({
  page,
}) => {
  await page.setViewportSize({ width: 380, height: 560 });
  await withAHero(page, 'hero-small');
  const idle = await settledHero(page);
  if (idle !== null) expect(overlaps(idle, await timerContent(page))).toBe(false);
});

test('T4: Start glides the hero once, then nothing animates it', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 720 });
  await withAHero(page, 'hero-glide');
  await page.waitForTimeout(700);
  const animationsOnHero = () =>
    page.evaluate(() => document.querySelector('[data-hero-box]')?.getAnimations().length ?? -1);

  await page.getByRole('button', { name: 'Start 25 min' }).click();
  await expect.poll(animationsOnHero, { timeout: 2_000 }).toBe(1);
  await page.waitForTimeout(600);
  expect(await animationsOnHero()).toBe(0);
});

test('T5: with reduced motion the hero is at its new box at once, without moving', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 480, height: 720 });
  await withAHero(page, 'hero-reduced');
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Start 25 min' }).click();
  await expect(page.getByRole('timer')).toContainText('25:00');
  // Any animation is an opacity fade; none moves the figure.
  const keyframes = await page.evaluate(() =>
    (document.querySelector('[data-hero-box]')?.getAnimations() ?? []).flatMap((a) =>
      ((a.effect as KeyframeEffect | null)?.getKeyframes() ?? []).map((k) => Object.keys(k)),
    ),
  );
  expect(keyframes.flat()).not.toContain('transform');
});
