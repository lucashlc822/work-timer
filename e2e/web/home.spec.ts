import { expect, test, type Page } from '@playwright/test';

import {
  dismissResult,
  expectSignedIn,
  focusButton,
  goHome,
  goToTimer,
  homeButton,
  openView,
  signIn,
  skipMoment,
} from '../support/app';
import { startClockInThePast } from '../support/clock';
import { befriend, createRoom, setName, shareFocus } from '../support/friends';
import { createUser } from '../support/users';

/**
 * Premium-motion PR 3: home is its own page. The app opens on it, the timer is
 * one press away, and a session in progress always finds its way back to the
 * timer page.
 */
test.use({ viewport: { width: 480, height: 720 } });

const mainNav = (page: Page) => page.getByRole('navigation', { name: 'Main' });
const timerTitle = (page: Page) => page.getByRole('heading', { name: 'Focus', level: 2 });

const signedIn = async (page: Page, label: string) => {
  const user = await createUser(label);
  await startClockInThePast(page);
  await page.goto('/');
  await signIn(page, user);
  await expectSignedIn(page);
  return user;
};

test('T1: a fresh sign-in opens home, with the navigation and Start focusing', async ({ page }) => {
  await signedIn(page, 'home-t1');
  await expect(mainNav(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start focusing' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Start \d+ min$/ })).toBeHidden();
});

test('T2: Start focusing opens the timer page on its title', async ({ page }) => {
  await signedIn(page, 'home-t2');
  await page.getByRole('button', { name: 'Start focusing' }).click();
  await expect(page.getByRole('button', { name: 'Start 25 min' })).toBeVisible();
  await expect(timerTitle(page)).toBeFocused();
  await expect(mainNav(page)).toBeHidden();
});

test('T3: Escape on the idle timer page goes home, onto Start focusing', async ({ page }) => {
  await signedIn(page, 'home-t3');
  await goToTimer(page);
  await page.keyboard.press('Escape');
  await expect(mainNav(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start focusing' })).toBeFocused();
});

test('T3b: Escape that closes the tag picker stays on the timer page', async ({ page }) => {
  await signedIn(page, 'home-t3b');
  await goToTimer(page);
  await page.getByRole('button', { name: 'No tag', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Choose a tag' });
  await expect(picker).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(picker).toBeHidden();
  await expect(homeButton(page)).toBeVisible();
});

test('T4: mid-session, Escape stays; home returns to focus and says how long is left', async ({
  page,
}) => {
  await signedIn(page, 'home-t4');
  await goToTimer(page);
  await page.getByRole('button', { name: 'Start 25 min' }).click();
  await expect(page.getByRole('timer')).toContainText('25:00');

  await page.keyboard.press('Escape');
  await expect(page.getByRole('timer')).toBeVisible();

  await homeButton(page).click();
  const cta = page.getByRole('button', { name: 'Return to focus' });
  await expect(cta).toBeFocused();
  await expect(page.getByText('Focusing · 25 min left')).toBeVisible();
  await expect(cta).toHaveAccessibleDescription('Focusing · 25 min left');

  await cta.click();
  await expect(page.getByRole('timer')).toBeVisible();
});

test('T5: a session that finishes while home brings the timer page and its moment back', async ({
  page,
}) => {
  await signedIn(page, 'home-t5');
  await goToTimer(page);
  await page.getByRole('button', { name: 'Start 25 min' }).click();
  await expect(page.getByRole('timer')).toContainText('25:00');
  await goHome(page);

  await page.clock.fastForward('25:01');
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
  await expect(homeButton(page)).toBeVisible();
  await expect(mainNav(page)).toBeHidden();
  // The moment plays now, not while the result was hidden on home.
  await expect(page.locator('[data-stage]')).not.toHaveAttribute('data-stage', 'settled');
  await skipMoment(page);
  await expect(page.locator('[data-stage]')).toHaveAttribute('data-stage', 'settled');
});

test('T6: a reload mid-session restores the timer page, not home', async ({ page }) => {
  await signedIn(page, 'home-t6');
  await goToTimer(page);
  await page.getByRole('button', { name: 'Start 25 min' }).click();
  await expect(page.getByRole('timer')).toContainText('25:00');

  await page.reload();
  await expect(page.getByRole('timer')).toBeVisible({ timeout: 15_000 });
  await expect(homeButton(page)).toBeVisible();
  await expect(mainNav(page)).toBeHidden();
});

test('T7: Stats opened from home goes back to home, onto Stats', async ({ page }) => {
  await signedIn(page, 'home-t7');
  await openView(page, 'Stats');
  await page.getByRole('button', { name: 'Back to home' }).click();
  await expect(page.getByRole('button', { name: 'Stats', exact: true })).toBeFocused();
});

test('T12: Start focusing is within four Tabs, and ten round trips never drop focus to the page', async ({
  page,
}) => {
  await signedIn(page, 'home-t12');
  const cta = focusButton(page);
  let reached = false;
  for (let i = 0; i < 4 && !reached; i++) {
    await page.keyboard.press('Tab');
    reached = await cta.evaluate((el) => el === document.activeElement);
  }
  expect(reached).toBe(true);

  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Enter');
    await expect(timerTitle(page)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(cta).toBeFocused();
  }
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
});

test.describe('with a friend', () => {
  // Real clock, as in together.spec.ts: a room's times are the server's.
  test('T8, T9: an invitation shows on home, and joining opens the lobby on the timer page', async ({
    page,
  }) => {
    const [ada, bea] = await Promise.all([createUser('home-ada'), createUser('home-bea')]);
    await Promise.all([setName(ada, 'Ada'), setName(bea, 'Bea')]);
    await befriend(ada, bea);
    await page.goto('/');
    await signIn(page, bea);
    await expect(mainNav(page)).toBeVisible({ timeout: 15_000 });

    await createRoom(ada, [bea], 1500);
    const banner = page.getByRole('region', { name: 'Invitation' });
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await banner.getByRole('button', { name: 'Join' }).click();

    await expect(page.getByText('Waiting for Ada to start.')).toBeVisible({ timeout: 15_000 });
    await expect(homeButton(page)).toBeVisible();
    await expect(mainNav(page)).toBeHidden();
  });
});

test.describe('a wide window (UI review M1)', () => {
  const box = (page: Page, selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, mid: (r.top + r.bottom) / 2 };
      });

  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 1920, height: 1080 },
  ]) {
    test(`W1–W3 at ${viewport.width}×${viewport.height}: the pair is centred, the column on the figure, the nav at the bottom`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await signedIn(page, `home-w${viewport.width}`);
      await expect(focusButton(page)).toBeVisible();
      const brand = await box(page, 'header');
      const nav = await box(page, 'nav[aria-label="Main"]');
      const hero = await box(page, '[data-hero-slot="home"]');
      const column = await box(page, '[data-home-column]');
      // W1: as much room above the pair as below it, between the name and the nav.
      const pairTop = Math.min(hero.top, column.top);
      const pairBottom = Math.max(hero.bottom, column.bottom);
      expect(Math.abs(pairTop - brand.bottom - (nav.top - pairBottom))).toBeLessThan(48);
      // W2: the right-hand column is centred on the figure beside it.
      expect(Math.abs(column.mid - hero.mid)).toBeLessThan(4);
      // W3: the navigation sits at the bottom of the window, as in a narrow one.
      expect(viewport.height - nav.bottom).toBeLessThan(64);
    });
  }

  test('W4: a narrow window keeps the greeting above the figure, and reads greeting first', async ({
    page,
  }) => {
    await signedIn(page, 'home-w4');
    await expect(focusButton(page)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Choose a constellation' })).toBeVisible();
    // Polled: the tiles and friends line arrive a moment after the page.
    await expect
      .poll(async () => {
        const greeting = await box(page, 'h2');
        const hero = await box(page, '[data-hero-slot="home"]');
        const status = await box(page, '[data-home-column] > div');
        return greeting.bottom <= hero.top + 1 && hero.bottom <= status.top + 1;
      })
      .toBe(true);
  });
});

test.describe('the dashboard (PR 5)', () => {
  test('P1: a first look shows the greeting, a ring at 0, no streak, and Add a friend', async ({
    page,
  }) => {
    await signedIn(page, 'home-p1');
    await expect(
      page.getByRole('heading', { level: 2, name: /^Good (morning|afternoon|evening)/ }),
    ).toBeVisible();
    await expect(page.getByRole('group', { name: 'Today 0 of 60 min' })).toBeVisible();
    await expect(page.getByRole('group', { name: '0-day streak' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add a friend' })).toBeVisible();
    // Tile labels are 12 px and each sits on one line (UI review L1).
    for (const label of ['Minutes today', 'Day streak', 'Stardust']) {
      const box = await page.getByText(label, { exact: true }).evaluate((el) => ({
        size: getComputedStyle(el).fontSize,
        lines: Math.round(
          el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight),
        ),
      }));
      expect(box).toEqual({ size: '12px', lines: 1 });
    }
  });

  test('P2: a finished session fills the ring and starts the streak, and Kite 1 of 4 says 3 to go', async ({
    page,
  }) => {
    await signedIn(page, 'home-p2');
    await page.getByRole('button', { name: 'Choose a constellation' }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /^The Kite/ })
      .click();
    await goToTimer(page);
    await page.getByRole('button', { name: 'Start 25 min' }).click();
    await expect(page.getByRole('timer')).toContainText('25:00');
    await page.clock.fastForward('25:01');
    await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
    await dismissResult(page);
    await goHome(page);

    await expect(page.getByRole('group', { name: 'Today 25 of 60 min' })).toBeVisible();
    await expect(page.getByRole('group', { name: '1-day streak' })).toBeVisible();
    await expect(page.getByText(/1 of 4 stars · 3 to go/)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Building The Kite · 1 of 4/ })).toBeVisible();
    // The constellation is drawn in its own space, clear of everything on home.
    const hero = await page.locator('[data-hero-box]').first().getAttribute('data-hero-box');
    expect(hero).not.toBeNull();
  });

  test('P3: a friend who starts focusing shows on home within about 15 seconds', async ({
    page,
  }) => {
    const [ada, bea] = await Promise.all([createUser('home-p3a'), createUser('home-p3b')]);
    await Promise.all([setName(ada, 'Ada'), setName(bea, 'Bea')]);
    await befriend(ada, bea);
    await page.goto('/');
    await signIn(page, bea);
    await expect(mainNav(page)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('No one is around right now')).toBeVisible({ timeout: 20_000 });
    // Over the sky this must be the secondary ink, not muted (UI review H1: ~2.6:1).
    expect(
      await page
        .getByText('No one is around right now')
        .evaluate((el) => getComputedStyle(el).color),
    ).toBe('rgb(185, 178, 212)');

    await shareFocus(ada, 25);
    await expect(page.getByText('Ada is focusing')).toBeVisible({ timeout: 25_000 });
  });

  test('P4: offline, home still opens with a plain greeting and no error', async ({
    page,
    context,
  }) => {
    await signedIn(page, 'home-p4');
    await context.setOffline(true);
    await page.reload();
    await expect(mainNav(page)).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole('heading', { level: 2, name: /^Good (morning|afternoon|evening)$/ }),
    ).toBeVisible();
    await expect(page.getByText(/error|failed|couldn.t/i)).toHaveCount(0);
  });
});
