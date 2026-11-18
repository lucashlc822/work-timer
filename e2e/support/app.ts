import { expect, type Page } from '@playwright/test';

import type { TestUser } from './users';

/**
 * Driving the app the way a person does: by the visible labels and button
 * names, never by CSS classes, so a restyle doesn't break a test.
 */

/**
 * The signed-in app is showing: home's main navigation, or the timer page's
 * Home button (a launch mid-session restores the timer page).
 */
export const expectSignedIn = async (page: Page): Promise<void> => {
  await expect(page.getByRole('navigation', { name: 'Main' }).or(homeButton(page))).toBeVisible({
    timeout: 15_000,
  });
};

/** The timer page's way back to home. */
export const homeButton = (page: Page) => page.getByRole('button', { name: 'Home', exact: true });

/** Home's call to action: "Start focusing", or "Return to focus" mid-session. */
export const focusButton = (page: Page) =>
  page.getByRole('button', { name: /^(Start focusing|Return to focus)$/ });

/** Opens the timer page from home; a no-op if it is already showing. */
export const goToTimer = async (page: Page): Promise<void> => {
  await expectSignedIn(page);
  if (await homeButton(page).isVisible()) return;
  await focusButton(page).click();
  await expect(homeButton(page)).toBeVisible();
};

/** Goes home from the timer page; a no-op if home is already showing. */
export const goHome = async (page: Page): Promise<void> => {
  await expectSignedIn(page);
  if (await homeButton(page).isVisible()) await homeButton(page).click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
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
  await goHome(page);
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible();
};

export const signOut = async (page: Page): Promise<void> => {
  await openAccount(page);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expectSignInScreen(page);
};

/**
 * Escape skips a finished session's completion moment (a click while it plays
 * only skips it, never presses what is under it). A no-op once it has settled.
 */
export const skipMoment = async (page: Page): Promise<void> => {
  await page.keyboard.press('Escape');
};

/** "Done" on a session's result, skipping its completion moment first. */
export const dismissResult = async (page: Page): Promise<void> => {
  await skipMoment(page);
  await page.getByRole('button', { name: 'Done' }).click();
};

/** Home's Stardust balance, e.g. "25 Stardust" (call `goHome` first). */
export const stardustPill = (page: Page) =>
  page.getByRole('button', { name: /^\W*[\d,]+ Stardust$/ });

/** Goes home and checks the Stardust balance there. */
export const expectStardust = async (
  page: Page,
  text: RegExp,
  options?: { timeout?: number },
): Promise<void> => {
  await goHome(page);
  await expect(stardustPill(page)).toHaveText(text, options);
};

/** Opens the timer's tag picker and returns its panel. */
export const openTagPicker = async (page: Page) => {
  await goToTimer(page);
  const panel = page.getByRole('dialog', { name: 'Choose a tag' });
  if (!(await panel.isVisible())) {
    await page.getByRole('button', { name: 'No tag', exact: true }).click();
  }
  await expect(panel).toBeVisible();
  return panel;
};

/** The footer's Stardust balance as a number. */
export const stardustBalance = async (page: Page): Promise<number> => {
  await goHome(page);
  const text = (await stardustPill(page).textContent()) ?? '';
  return Number(text.replace(/[^\d]/g, ''));
};

/** Opens one of home's views ("Stats", "Account", ...), going home first. */
export const openView = async (page: Page, name: 'View sky' | 'Stats' | 'Account') => {
  await goHome(page);
  await page.getByRole('button', { name, exact: true }).click();
  await expect(page.getByRole('button', { name: 'Back to home' })).toBeVisible();
};

/** Opens the Friends panel. The pill's name carries the waiting-request count, if any. */
export const openFriends = async (page: Page): Promise<void> => {
  await goHome(page);
  await page.getByRole('button', { name: /^Friends(,|$)/ }).click();
  await expect(page.getByRole('heading', { name: 'Friends', level: 2 })).toBeVisible();
};

/** Closes a view opened from home with its Back button, then opens the timer page. */
export const backToTimer = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: /^Back to (home|timer)$/ }).click();
  await goToTimer(page);
  await expect(page.getByRole('button', { name: /^Start (\d+ min|Pomodoro)$/ })).toBeVisible();
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
