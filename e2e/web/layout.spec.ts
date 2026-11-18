import { expect, test, type Locator, type Page } from '@playwright/test';

import { expectSignedIn, goHome, goToTimer, openAccount, signIn } from '../support/app';
import { startClockInThePast } from '../support/clock';
import { befriend, createRoom, rpc, setName } from '../support/friends';
import { createUser } from '../support/users';

/**
 * The desktop app opens at 480x720 (`src-tauri/tauri.conf.json`), so this size is
 * what most desktop users see every day, not an edge case.
 */
test.use({ viewport: { width: 480, height: 720 } });

const signedIn = async (page: Page, label: string) => {
  const user = await createUser(label);
  await startClockInThePast(page);
  await page.goto('/');
  await signIn(page, user);
  await expectSignedIn(page);
};

/** Nothing scrolls, and `bottom` (the lowest thing that must show) is inside the window. */
const expectNoScroll = async (page: Page, bottom: Locator) => {
  const box = await bottom.boundingBox();
  const { scrollHeight, innerHeight } = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
  }));
  expect(scrollHeight, `page is ${scrollHeight}px tall`).toBeLessThanOrEqual(innerHeight);
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(innerHeight);
};

/** The everyday progress line, wherever it is visible ("Today 0 of 60 min"). */
const todayLine = (page: Page) => page.getByText(/^Today \d+ of \d+ min/).filter({ visible: true });

for (const size of [
  { width: 480, height: 720 },
  { width: 380, height: 560 },
]) {
  test.describe(`at ${size.width}x${size.height}`, () => {
    test.use({ viewport: size });

    test('home fits without scrolling', async ({ page }) => {
      await signedIn(page, 'layout-home');
      await expect(todayLine(page)).toBeVisible();
      await expect(page.getByRole('button', { name: /constellation/i })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Start focusing' })).toBeVisible();
      await expectNoScroll(page, page.getByRole('navigation', { name: 'Main' }));
    });

    test('the idle timer page fits without scrolling', async ({ page }) => {
      await signedIn(page, 'layout-timer');
      await goToTimer(page);
      // The hint and the goal line arrive after the first paint; measure once
      // the page is as tall as it is going to be.
      await expect(todayLine(page)).toBeVisible();
      await expect(page.getByText(/wandering star|Adds star|Won.t count/)).toBeVisible();
      await page.screenshot({ path: test.info().outputPath('timer.png'), fullPage: true });
      await expectNoScroll(page, page.getByRole('button', { name: 'Start 25 min' }));
    });
  });
}

test.describe('with something above the timer', () => {
  // Real clock, as in together.spec.ts: a room's times are the server's.
  const withFriend = async (page: Page) => {
    const [ada, bea] = await Promise.all([createUser('layout-ada'), createUser('layout-bea')]);
    await Promise.all([setName(ada, 'Ada'), setName(bea, 'Bea')]);
    await befriend(ada, bea);
    await page.goto('/');
    await signIn(page, bea);
    await goToTimer(page);
    // "Focus with friends" makes this the tallest everyday idle screen.
    await expect(page.getByRole('button', { name: 'Focus with friends' })).toBeVisible();
    await expect(todayLine(page)).toBeVisible();
    return { ada, bea };
  };

  test('"Focus with friends" is at least 24 CSS pixels tall (2.5.8)', async ({ page }) => {
    await withFriend(page);
    const box = await page.getByRole('button', { name: 'Focus with friends' }).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(24);
  });

  test('an invitation still leaves Start, and home its navigation, in the window', async ({
    page,
  }, testInfo) => {
    const { ada, bea } = await withFriend(page);
    await createRoom(ada, [bea], 1500);
    await expect(page.getByRole('region', { name: 'Invitation' })).toBeVisible({
      timeout: 15_000,
    });

    await page.screenshot({ path: testInfo.outputPath('invite-480x720.png') });
    await expectNoScroll(page, page.getByRole('button', { name: 'Start 25 min' }));
    await goHome(page);
    await expect(page.getByRole('region', { name: 'Invitation' })).toBeVisible();
    await expectNoScroll(page, page.getByRole('navigation', { name: 'Main' }));
  });

  test('a lobby that ended still leaves Start in the window', async ({ page }, testInfo) => {
    const { ada, bea } = await withFriend(page);
    const room = await createRoom(ada, [bea], 1500);
    await rpc(bea, 'respond_room', { room, join_room: true });
    await expect(page.getByText('Waiting for Ada to start.')).toBeVisible({ timeout: 15_000 });
    await rpc(ada, 'leave_room', { room });
    const note = page.getByRole('region', { name: 'Friends session' });
    await expect(note).toContainText('Ada closed the lobby.', { timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Start 25 min' })).toBeVisible();

    await page.screenshot({ path: testInfo.outputPath('lobby-ended-480x720.png') });
    await expectNoScroll(page, page.getByRole('button', { name: 'Start 25 min' }));

    // Once it's dismissed the screen is back to its everyday spacing.
    await note.getByRole('button', { name: 'OK' }).click();
    await expect(note).toBeHidden();
    await expect(page.getByRole('button', { name: 'Start 25 min' })).toBeFocused();
    expect(await page.locator('main').evaluate((el) => getComputedStyle(el).rowGap)).toBe('24px');
  });
});

test('Account’s version line is in the readable text colour', async ({ page }) => {
  await signedIn(page, 'layout-version');
  await openAccount(page);
  const colour = await page
    .getByText(/^\S+ \d+\.\d+\.\d+$/)
    .evaluate((el) => getComputedStyle(el).color);

  // --color-ink-secondary; ink-muted (#817a9f) fails axe's contrast mid-fade.
  expect(colour).toBe('rgb(185, 178, 212)');
});
