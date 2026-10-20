import { expect, test } from '@playwright/test';

import { AUTH_MESSAGES } from '../../src/features/account/domain/auth';
import {
  expectSignedIn,
  expectSignInScreen,
  openAccount,
  openTagPicker,
  passwordField,
  signIn,
  signOut,
  stardustPill,
} from '../support/app';
import { waitForCode } from '../support/inbox';
import {
  adminClient,
  createUser,
  invite,
  newId,
  TEST_PASSWORD,
  uniqueEmail,
} from '../support/users';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('an invited person signs up with the emailed code and reaches the app', async ({ page }) => {
  const email = uniqueEmail('signup');
  await invite(email);

  await page.getByRole('button', { name: 'New here? Create an account' }).click();
  await page.getByLabel('Email').fill(email);
  await passwordField(page).fill(TEST_PASSWORD);
  const since = Date.now();
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  await page.getByLabel('6-digit code').fill(await waitForCode(email, { since }));
  await page.getByRole('button', { name: 'Confirm' }).click();

  await expectSignedIn(page);
  await openAccount(page);
  await expect(page.getByText(email)).toBeVisible();
});

test('an address that was never invited cannot sign up', async ({ page }) => {
  await page.getByRole('button', { name: 'New here? Create an account' }).click();
  await page.getByLabel('Email').fill(uniqueEmail('uninvited'));
  await passwordField(page).fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByRole('alert')).toHaveText(AUTH_MESSAGES.notInvited);
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
});

test('a wrong confirmation code is refused', async ({ page }) => {
  const email = uniqueEmail('badcode');
  await invite(email);

  await page.getByRole('button', { name: 'New here? Create an account' }).click();
  await page.getByLabel('Email').fill(email);
  await passwordField(page).fill(TEST_PASSWORD);
  const since = Date.now();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

  // Any code but the real one.
  const real = await waitForCode(email, { since });
  const wrong = real === '000000' ? '111111' : '000000';
  await page.getByLabel('6-digit code').fill(wrong);
  await page.getByRole('button', { name: 'Confirm' }).click();

  await expect(page.getByRole('alert')).toHaveText(AUTH_MESSAGES.badCode);
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
});

test('sign-in works, and a wrong password is refused', async ({ page }) => {
  const user = await createUser('signin');

  await signIn(page, { email: user.email, password: 'not-the-password' });
  await expect(page.getByRole('alert')).toHaveText(AUTH_MESSAGES.wrongCredentials);

  await passwordField(page).fill(user.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expectSignedIn(page);
});

test('a forgotten password is reset with an emailed code', async ({ page }) => {
  const user = await createUser('reset');
  const newPassword = 'e2e-new-pass-2';

  await page.getByRole('button', { name: 'Forgot your password?' }).click();
  await page.getByLabel('Email').fill(user.email);
  const since = Date.now();
  await page.getByRole('button', { name: 'Send code' }).click();

  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
  await page.getByLabel('6-digit code').fill(await waitForCode(user.email, { since }));
  await page.getByLabel('New password').fill(newPassword);
  await page.getByRole('button', { name: 'Save password' }).click();
  await expectSignedIn(page);

  await signOut(page);
  await signIn(page, user);
  await expect(page.getByRole('alert')).toHaveText(AUTH_MESSAGES.wrongCredentials);
  await passwordField(page).fill(newPassword);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expectSignedIn(page);
});

test('after sign-out, the next account on the same browser sees none of the first one’s data', async ({
  page,
}) => {
  const a = await createUser('first');
  const b = await createUser('second');

  // A's data, put straight on the server: a tag and 25 Stardust.
  const now = new Date().toISOString();
  const tagName = `A only ${a.id.slice(0, 6)}`;
  const admin = adminClient();
  const tag = await admin.from('tags').insert({
    id: newId(),
    user_id: a.id,
    name: tagName,
    color: 'rose',
    created_at: now,
    updated_at: now,
  });
  expect(tag.error).toBeNull();
  const ledger = await admin.from('ledger').insert({
    id: newId(),
    user_id: a.id,
    reason: 'e2e',
    delta: 25,
    ref: 'e2e',
    created_at: now,
  });
  expect(ledger.error).toBeNull();

  // A signs in and their data arrives through sync.
  await signIn(page, a);
  await expectSignedIn(page);
  await expect(stardustPill(page)).toHaveText(/\b25 Stardust$/, { timeout: 20_000 });
  await expect((await openTagPicker(page)).getByText(tagName)).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press('Escape');

  await signOut(page);
  await expectSignInScreen(page);

  // B, on the same browser.
  await signIn(page, b);
  await expectSignedIn(page);
  await openAccount(page);
  await expect(page.getByText(b.email)).toBeVisible();
  await expect(page.getByText(a.email)).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to timer' }).click();

  // DELIBERATELY BROKEN (scratch branch only): proves the CI e2e job goes red.
  await expect(stardustPill(page)).toHaveText(/\b999 Stardust$/);
  const panel = await openTagPicker(page);
  await expect(panel.getByText(tagName)).toHaveCount(0);
});
