import { expect, test } from '@playwright/test';

import {
  expectSignedIn,
  openAccount,
  openTagPicker,
  passwordField,
  sessionsOnDevice,
  signIn,
  signOut,
  stardustPill,
} from '../support/app';
import { closeDevices, openDevice, settle, tagNames } from '../support/devices';
import { waitForCode } from '../support/inbox';
import { createUser, invite, TEST_PASSWORD, uniqueEmail } from '../support/users';
import { launchDesktop, type Desktop } from './launch';

/**
 * The desktop app (a `tauri dev` build in its own throwaway WebView2 profile,
 * see launch.ts), signing in and syncing with a web "device" on the same
 * account. One app for the whole file, so the tests run in order.
 *
 * Sessions here are real time, not a fast-forwarded clock: the dev build's
 * "1 min (dev)" preset finishes in about a minute, and its end is the same
 * moment for the app, its Rust deadline thread and the server.
 */

const WEB = 'http://127.0.0.1:4174';

test.describe.configure({ mode: 'serial' });

let desktop: Desktop;

test.beforeAll(async () => {
  test.setTimeout(600_000);
  desktop = await launchDesktop();
});

test.afterAll(async () => {
  await desktop?.stop();
});

test('sign up with the emailed code, sign out, and sign back in on the desktop', async () => {
  const page = desktop.page;
  const email = uniqueEmail('desktop-signup');
  await invite(email);

  await page.getByRole('button', { name: 'New here? Create an account' }).click();
  await page.getByLabel('Email').fill(email);
  await passwordField(page).fill(TEST_PASSWORD);
  const since = Date.now();
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByLabel('6-digit code').fill(await waitForCode(email, { since }));
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expectSignedIn(page);
  await openAccount(page);
  await expect(page.getByText(email)).toBeVisible();
  await page.getByRole('button', { name: 'Back to timer' }).click();

  await signOut(page);
  await signIn(page, { email, password: TEST_PASSWORD });
  await expectSignedIn(page);
  await signOut(page);
});

test('a session finished on the desktop reaches the web, and a tag made on the web reaches the desktop', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const page = desktop.page;
  const user = await createUser('desktop-sync');
  await signIn(page, user);
  await expectSignedIn(page);
  await settle(page);
  const web = await openDevice(browser, WEB, user);
  try {
    // A real one-minute session on the desktop.
    await page.getByRole('radio', { name: '1 min (dev)' }).click();
    await page.getByRole('button', { name: 'Start 1 min' }).click();
    await expect(page.getByRole('timer')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible({
      timeout: 120_000,
    });
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(stardustPill(page)).toHaveText(/\b1 Stardust$/);

    // The web device gets it without being told to.
    await expect(stardustPill(web.page)).toHaveText(/\b1 Stardust$/, { timeout: 30_000 });
    await expect.poll(() => sessionsOnDevice(web.page), { timeout: 20_000 }).toBe(1);

    // And the other way: a tag made on the web appears in the desktop's picker.
    const panel = await openTagPicker(web.page);
    await panel.getByLabel('New tag name').fill('From the web');
    await panel.getByLabel('New tag name').press('Enter');
    await expect.poll(() => tagNames(page), { timeout: 30_000 }).toContain('From the web');
  } finally {
    await closeDevices(web);
    await signOut(page);
  }
});
