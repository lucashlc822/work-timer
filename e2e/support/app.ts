import { expect, type Page } from '@playwright/test';

import type { TestUser } from './users';

/**
 * Driving the app the way a person does: by the visible labels and button
 * names, never by CSS classes, so a restyle doesn't break a test.
 */

/** The signed-in app is showing (its footer's Account button is the landmark). */
export const expectSignedIn = async (page: Page): Promise<void> => {
  await expect(page.getByRole('button', { name: 'Account', exact: true })).toBeVisible({
    timeout: 15_000,
  });
};

export const expectSignInScreen = async (page: Page): Promise<void> => {
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible({ timeout: 15_000 });
};

/**
 * The password field on sign-in and sign-up, the only password input on
 * either. Not found by label: on sign-up the label also wraps the length hint,
 * so its text is "PasswordAt least 8 characters." and no label match is clean.
 */
export const passwordField = (page: Page) => page.locator('input[type="password"]');

export const signIn = async (page: Page, user: Pick<TestUser, 'email' | 'password'>) => {
  await expectSignInScreen(page);
  await page.getByLabel('Email').fill(user.email);
  await passwordField(page).fill(user.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
};

export const openAccount = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible();
};

export const signOut = async (page: Page): Promise<void> => {
  await openAccount(page);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expectSignInScreen(page);
};

/** The footer's Stardust balance, e.g. "25 Stardust". */
export const stardustPill = (page: Page) =>
  page.getByRole('button', { name: /^\W*[\d,]+ Stardust$/ });

/** Opens the timer's tag picker and returns its panel. */
export const openTagPicker = async (page: Page) => {
  const panel = page.getByRole('dialog', { name: 'Choose a tag' });
  if (!(await panel.isVisible())) {
    await page.getByRole('button', { name: 'No tag', exact: true }).click();
  }
  await expect(panel).toBeVisible();
  return panel;
};

/** The footer's Stardust balance as a number. */
export const stardustBalance = async (page: Page): Promise<number> => {
  const text = (await stardustPill(page).textContent()) ?? '';
  return Number(text.replace(/[^\d]/g, ''));
};

/** Opens a footer view ("Stats", "Account", ...). */
export const openView = async (page: Page, name: 'View sky' | 'Stats' | 'Account') => {
  await page.getByRole('button', { name, exact: true }).click();
  await expect(page.getByRole('button', { name: 'Back to timer' })).toBeVisible();
};

export const backToTimer = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: 'Back to timer' }).click();
  await expect(page.getByRole('button', { name: /^Start / })).toBeVisible();
};

/** The sync line in the Account panel ("Backed up · synced just now", "Offline", ...). */
export const syncLine = (page: Page) =>
  page.getByRole('region', { name: 'Sync' }).getByRole('status');

/**
 * Shows the Account panel's sync line, runs "Sync now" and waits for the
 * round to finish. Leaves the app on the timer.
 */
export const syncNow = async (page: Page): Promise<void> => {
  await openView(page, 'Account');
  await page.getByRole('button', { name: 'Sync now' }).click();
  await expect(syncLine(page)).toContainText('Backed up', { timeout: 20_000 });
  await backToTimer(page);
};

/**
 * How many sessions this device's own history holds, from Stats → All time
 * ("Sessions · 2"). Reads the device's local copy, so it shows whether a
 * session from another device really arrived, not only its Stardust.
 */
export const sessionsOnDevice = async (page: Page): Promise<number> => {
  await openView(page, 'Stats');
  await page.getByRole('tab', { name: 'All time' }).click();
  const heading = page.getByRole('region', { name: 'Sessions' }).getByRole('heading');
  const text = (await heading.isVisible()) ? await heading.innerText() : '';
  await backToTimer(page);
  return Number(/·\s*(\d+)/.exec(text)?.[1] ?? 0);
};
