import { expect, test, type Page } from '@playwright/test';

import { report, scan, settleTransitions, type Finding } from '../support/a11y';
import { backToTimer, expectSignedIn, signIn, stardustPill } from '../support/app';
import { adminClient, createUser, seedStardust, type TestUser } from '../support/users';

/**
 * The Stardust shop's buying flow: Buy asks first, Escape closes the question
 * and not the panel, and a confirmed purchase lands focus on Equip, says so
 * politely, flares the star, and writes exactly one ledger row.
 */

const purchases = async (user: TestUser) => {
  const { data, error } = await adminClient()
    .from('ledger')
    .select('delta')
    .eq('user_id', user.id)
    .eq('reason', 'purchase');
  expect(error).toBeNull();
  return data;
};

/** A signed-in account with 1,000 Stardust and the shop open on the Ember card. */
const openShop = async (page: Page, label: string) => {
  const user = await createUser(label);
  await seedStardust(user, 1000);
  await page.goto('/');
  await signIn(page, user);
  await expectSignedIn(page);
  await expect(stardustPill(page)).toHaveText(/\b1,000 Stardust$/, { timeout: 20_000 });
  await stardustPill(page).click();
  await page.getByRole('region', { name: 'Shop' }).waitFor();
  await settleTransitions(page);
  return { user, ember: page.getByRole('listitem').filter({ hasText: 'Ember' }) };
};

test('Buy asks first; Escape closes the question, not the panel; nothing is spent', async ({
  page,
}, testInfo) => {
  const { user, ember } = await openShop(page, 'shop-ask');

  await ember.getByRole('button', { name: /^Buy Ember/ }).click();
  await expect(ember.getByText(/You’ll have/)).toContainText('700');
  await expect(ember.getByRole('button', { name: 'Buy', exact: true })).toBeFocused();

  const findings: Finding[] = await scan(page, 'shop, asking to buy');
  await report(testInfo, findings);

  await page.keyboard.press('Escape');
  await expect(ember.getByText(/You’ll have/)).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Shop' })).toBeVisible();
  await expect(ember.getByRole('button', { name: /^Buy Ember/ })).toBeFocused();
  expect(await purchases(user)).toEqual([]);

  // With nothing being asked, Escape is the panel's again: it leaves, as it always has.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /^Start / })).toBeVisible();
  await expect(stardustPill(page)).toHaveText(/\b1,000 Stardust$/);
});

test('Not now spends nothing and puts focus back on Buy', async ({ page }) => {
  const { user, ember } = await openShop(page, 'shop-notnow');

  await ember.getByRole('button', { name: /^Buy Ember/ }).click();
  await ember.getByRole('button', { name: 'Not now' }).click();

  await expect(ember.getByText(/You’ll have/)).toHaveCount(0);
  await expect(ember.getByRole('button', { name: /^Buy Ember/ })).toBeFocused();
  expect(await purchases(user)).toEqual([]);
});

test('confirming buys once: a polite message, a flare, focus on Equip, one ledger row', async ({
  page,
}) => {
  const { user, ember } = await openShop(page, 'shop-buy');

  await ember.getByRole('button', { name: /^Buy Ember/ }).click();
  await ember.getByRole('button', { name: 'Buy', exact: true }).click();

  await expect(page.getByRole('status').filter({ hasText: 'Ember is yours.' })).toBeAttached();
  await expect(ember.getByRole('button', { name: 'Equip Ember' })).toBeFocused();

  const flare = ember.locator('.shop-flare');
  await expect(flare).toHaveCount(1);
  expect(await flare.evaluate((el) => getComputedStyle(el).animationName)).toBe('shop-flare');

  await expect.poll(() => purchases(user), { timeout: 30_000 }).toEqual([{ delta: -300 }]);

  await ember.getByRole('button', { name: 'Equip Ember' }).click();
  await expect(ember.getByText('Equipped')).toBeVisible();

  await backToTimer(page);
  await expect(stardustPill(page)).toHaveText(/\b700 Stardust$/);
});

test('with reduced motion there is no flare animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { ember } = await openShop(page, 'shop-reduced');

  await ember.getByRole('button', { name: /^Buy Ember/ }).click();
  await ember.getByRole('button', { name: 'Buy', exact: true }).click();

  const flare = ember.locator('.shop-flare');
  await expect(flare).toHaveCount(1);
  expect(await flare.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
});
