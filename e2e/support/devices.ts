import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

import { backToTimer, expectSignedIn, openTagPicker, openView, signIn, syncLine } from './app';
import { startClockInThePast } from './clock';
import type { TestUser } from './users';

/**
 * One "device" is one browser context: its own cookies, localStorage and
 * IndexedDB, exactly as a second computer would have. Two devices on one
 * account is how sync is exercised.
 */
export interface Device {
  context: BrowserContext;
  page: Page;
}

export const openDevice = async (
  browser: Browser,
  baseURL: string,
  user: Pick<TestUser, 'email' | 'password'>,
  options: { clockMinutesAgo?: number } = {},
): Promise<Device> => {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  if (options.clockMinutesAgo !== undefined) {
    await startClockInThePast(page, options.clockMinutesAgo);
  }
  await page.goto('/');
  await signIn(page, user);
  await expectSignedIn(page);
  await settle(page);
  return { context, page };
};

/**
 * Waits until no sync round is running and the last one succeeded ("Backed up"
 * in the Account panel), then returns to the timer.
 *
 * Tests cut a device's network right after it signs in. A sign-in round
 * still running at that moment would be cut mid-way, and what the tests then
 * assert (what is pending, what reconnects first) should start from a quiet
 * device rather than depend on that race.
 */
export const settle = async (page: Page): Promise<void> => {
  await openView(page, 'Account');
  await expect(syncLine(page)).toContainText('Backed up', { timeout: 20_000 });
  await backToTimer(page);
};

export const closeDevices = async (...devices: Device[]): Promise<void> => {
  for (const device of devices) await device.context.close();
};

/** The tag names the picker lists (not counting "No tag"), in order. */
export const tagNames = async (page: Page): Promise<string[]> => {
  const panel = await openTagPicker(page);
  const names = await panel.getByRole('listitem').allInnerTexts();
  await page.keyboard.press('Escape');
  return names.map((name) => name.replace(/✓/g, '').trim()).filter((name) => name !== 'No tag');
};

/** Renames a tag through "Manage tags", the way a person does, and closes the picker. */
export const renameTag = async (page: Page, from: string, to: string): Promise<void> => {
  const panel = await openTagPicker(page);
  await panel.getByRole('button', { name: 'Manage tags' }).click();
  const field = panel.getByLabel(`Name of ${from}`);
  await field.fill(to);
  await field.press('Enter');
  await panel.getByLabel(`Name of ${to}`).waitFor();
  await panel.getByRole('button', { name: 'Done' }).click();
  await page.keyboard.press('Escape');
};
