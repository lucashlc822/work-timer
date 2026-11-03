import { expect, test, type Page } from '@playwright/test';

import { expectSignedIn, openAccount, signIn } from '../support/app';
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

test('the idle screen fits the desktop app’s default window without scrolling', async ({
  page,
}) => {
  await signedIn(page, 'layout-fit');
  // The hint, the goal line and the footer's constellation button arrive after the
  // first paint; measure only once the page is as tall as it is going to be.
  await expect(page.getByText(/^Today \d+ of \d+ min/)).toBeVisible();
  await expect(page.getByText(/wandering star|Adds star|Won.t count/)).toBeVisible();
  await expect(page.getByRole('button', { name: /constellation/i })).toBeVisible();
  const start = await page.getByRole('button', { name: 'Start 25 min' }).boundingBox();
  const page_ = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
  }));

  expect(page_.scrollHeight).toBeLessThanOrEqual(page_.clientHeight);
  expect((start?.y ?? 0) + (start?.height ?? 0)).toBeLessThanOrEqual(720);
});

/** The page doesn't scroll and the footer's navigation is fully in the window. */
const expectFitsWindow = async (page: Page) => {
  const nav = await page.getByRole('navigation', { name: 'Main' }).boundingBox();
  const { scrollHeight, innerHeight } = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
  }));
  expect(scrollHeight, `page is ${scrollHeight}px tall`).toBeLessThanOrEqual(innerHeight);
  expect((nav?.y ?? 0) + (nav?.height ?? 0)).toBeLessThanOrEqual(innerHeight);
};

test.describe('with something above the timer', () => {
  // Real clock, as in together.spec.ts: a room's times are the server's.
  const withFriend = async (page: Page) => {
    const [ada, bea] = await Promise.all([createUser('layout-ada'), createUser('layout-bea')]);
    await Promise.all([setName(ada, 'Ada'), setName(bea, 'Bea')]);
    await befriend(ada, bea);
    await page.goto('/');
    await signIn(page, bea);
    await expectSignedIn(page);
    // "Focus with friends" makes this the tallest everyday idle screen.
    await expect(page.getByRole('button', { name: 'Focus with friends' })).toBeVisible();
    await expect(page.getByText(/^Today \d+ of \d+ min/)).toBeVisible();
    await expect(page.getByRole('button', { name: /constellation/i })).toBeVisible();
    return { ada, bea };
  };

  test('an invitation still leaves the footer in the window', async ({ page }, testInfo) => {
    const { ada, bea } = await withFriend(page);
    await createRoom(ada, [bea], 1500);
    await expect(page.getByRole('region', { name: 'Invitation' })).toBeVisible({
      timeout: 15_000,
    });

    await page.screenshot({ path: testInfo.outputPath('invite-480x720.png') });
    await expectFitsWindow(page);
  });

  test('a lobby that ended still leaves the footer in the window', async ({ page }, testInfo) => {
    const { ada, bea } = await withFriend(page);
    const room = await createRoom(ada, [bea], 1500);
    await rpc(bea, 'respond_room', { room, join_room: true });
    await expect(page.getByText('Waiting for Ada to start.')).toBeVisible({ timeout: 15_000 });
    await rpc(ada, 'leave_room', { room });
    const note = page.getByRole('region', { name: 'Friends session' });
    await expect(note).toContainText('Ada closed the lobby.', { timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Start 25 min' })).toBeVisible();

    await page.screenshot({ path: testInfo.outputPath('lobby-ended-480x720.png') });
    await expectFitsWindow(page);

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
