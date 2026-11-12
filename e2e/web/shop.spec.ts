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
  await page.getByRole('tabpanel', { name: 'Shop' }).waitFor();
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
  await expect(page.getByRole('tabpanel', { name: 'Shop' })).toBeVisible();
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

test('asking to buy does not move the shop, and the question fits its card', async ({ page }) => {
  const user = await createUser('shop-steady');
  await seedStardust(user, 10_000);
  await page.goto('/');
  await signIn(page, user);
  await expectSignedIn(page);
  await expect(stardustPill(page)).toHaveText(/\b10,000 Stardust$/, { timeout: 20_000 });
  await stardustPill(page).click();
  await page.getByRole('tabpanel', { name: 'Shop' }).waitFor();

  // A card of each kind, and the heading that follows its collection.
  const cases: Array<[string, string]> = [
    ['Ember', 'Sky themes'],
    ['Dusk', 'Constellation packs'],
    ['Woodland pack', 'Shortcuts'],
  ];
  const sizes = [
    { width: 1280, height: 800 },
    { width: 768, height: 1024 },
    { width: 375, height: 812 },
  ];

  for (const size of sizes) {
    await page.setViewportSize(size);
    await settleTransitions(page);
    for (const [name, next] of cases) {
      await test.step(`${name} at ${size.width}px`, async () => {
        const card = page.getByRole('listitem').filter({ hasText: name }).first();
        const heading = page.getByRole('heading', { name: next, level: 3 });
        await card.scrollIntoViewIfNeeded();

        // Scroll-proof: the card's own height, and the gap from its top to the next heading.
        const measure = async () =>
          card.evaluate((el, headingText) => {
            const h = Array.from(document.querySelectorAll('h3')).find(
              (x) => x.textContent?.trim() === headingText,
            );
            const box = el.getBoundingClientRect();
            return { height: box.height, gap: (h?.getBoundingClientRect().top ?? 0) - box.top };
          }, next);
        await expect(heading).toBeVisible();
        const before = await measure();

        await card.getByRole('button', { name: new RegExp(`^Buy ${name}`) }).click();
        const question = card.locator('p');
        const confirm = card.getByRole('button', { name: 'Buy', exact: true });
        const notNow = card.getByRole('button', { name: 'Not now' });
        await expect(confirm).toBeFocused();

        const after = await measure();
        expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(1);
        expect(Math.abs(after.gap - before.gap)).toBeLessThanOrEqual(1);

        // Everything of the question sits inside the card.
        const cardBox = (await card.boundingBox())!;
        for (const part of [question, confirm, notNow]) {
          const box = (await part.boundingBox())!;
          expect(box.x).toBeGreaterThanOrEqual(cardBox.x - 1);
          expect(box.y).toBeGreaterThanOrEqual(cardBox.y - 1);
          expect(box.x + box.width).toBeLessThanOrEqual(cardBox.x + cardBox.width + 1);
          expect(box.y + box.height).toBeLessThanOrEqual(cardBox.y + cardBox.height + 1);
        }

        // The card's usual Buy cannot be reached while asking.
        await expect(
          card.getByRole('button', { name: new RegExp(`^Buy ${name} for`) }),
        ).toHaveCount(0);

        await notNow.click();
        const back = await measure();
        expect(Math.abs(back.height - before.height)).toBeLessThanOrEqual(1);
        expect(Math.abs(back.gap - before.gap)).toBeLessThanOrEqual(1);
      });
    }
  }
  expect(await purchases(user)).toEqual([]);
});

test('the three Stardust tabs share one width, so switching tabs moves nothing', async ({
  page,
}) => {
  const user = await createUser('shop-tabs');
  await page.goto('/');
  await signIn(page, user);
  await expectSignedIn(page);
  await stardustPill(page).click();
  await page.getByRole('tabpanel', { name: 'Shop' }).waitFor();

  for (const size of [
    { width: 1280, height: 800 },
    { width: 768, height: 1024 },
    { width: 375, height: 812 },
  ]) {
    await page.setViewportSize(size);
    await settleTransitions(page);
    await test.step(`${size.width}px`, async () => {
      const widths: number[] = [];
      let barBefore: { x: number; width: number } | null = null;
      for (const name of ['Shop', 'Goal & streak', 'History']) {
        await page.getByRole('tab', { name, exact: true }).click();
        const panel = page.getByRole('tabpanel', { name, exact: true });
        await expect(panel).toBeVisible();
        widths.push((await panel.boundingBox())!.width);
        if (name === 'Shop') {
          // At the shared width no card clips its name, price or button.
          const clipped = await panel.evaluate((el) =>
            Array.from(el.querySelectorAll('li'))
              .filter((li) => li.scrollWidth > li.clientWidth)
              .map((li) => li.textContent),
          );
          expect(clipped).toEqual([]);
        }

        const bar = (await page.getByRole('tablist', { name: 'Stardust' }).boundingBox())!;
        barBefore ??= { x: bar.x, width: bar.width };
        expect(Math.abs(bar.x - barBefore.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(bar.width - barBefore.width)).toBeLessThanOrEqual(1);
      }
      expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
      expect(Math.max(...widths)).toBeLessThanOrEqual(576 + 1);
    });
  }
});
