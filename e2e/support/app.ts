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
