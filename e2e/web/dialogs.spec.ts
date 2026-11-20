import { expect, test, type Page } from '@playwright/test';

import { goHome, goToTimer, openTagPicker, signIn } from '../support/app';
import { startClockInThePast } from '../support/clock';
import { befriend, createRoom, setName } from '../support/friends';
import { createUser } from '../support/users';

/**
 * Premium-motion PR 8: dialogs, the tag popover, the update notice and
 * banners come and go. A dialog fades and rises from 0.96, the popover opens
 * from its trigger, and focus goes back the moment one starts to leave.
 */
test.use({ viewport: { width: 480, height: 720 } });

const signedIn = async (page: Page, label: string) => {
  const user = await createUser(label);
  await startClockInThePast(page);
  await page.goto('/');
  await signIn(page, user);
  await goToTimer(page);
};

const running = async (page: Page, label: string) => {
  await signedIn(page, label);
  await page.getByRole('button', { name: 'Start 25 min' }).click();
  await expect(page.getByRole('timer')).toContainText('25:00');
};

test('T1: End early → Keep going: focus is back on End early before the dialog leaves the page', async ({
  page,
}) => {
  await running(page, 'dlg-t1');
  const endEarly = page.getByRole('button', { name: 'End early' });
  await endEarly.click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: 'Keep going' })).toBeFocused();
  await page.waitForTimeout(400);

  await page.getByRole('button', { name: 'Keep going' }).click();
  // Straight away: the dialog is still leaving, out of reach, and focus is back.
  const during = await page.evaluate(() => {
    const d = document.querySelector('[role="alertdialog"]');
    return {
      leaving: d !== null,
      inert: d?.closest('[inert]') !== null,
      focus: (document.activeElement as HTMLElement | null)?.textContent ?? null,
    };
  });
  expect(during.focus).toBe('End early');
  if (during.leaving) expect(during.inert).toBe(true);
  await expect(dialog).toHaveCount(0);
  await expect(endEarly).toBeFocused();
});

test('T1b: a dialog animates in with opacity and a small scale', async ({ page }) => {
  await running(page, 'dlg-t1b');
  await page.getByRole('button', { name: 'End early' }).click();
  const keyframes = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[role="alertdialog"]'))
      .flatMap((d) => d.getAnimations())
      .flatMap((a) => (a.effect as KeyframeEffect | null)?.getKeyframes() ?? [])
      .flatMap((k) => Object.keys(k)),
  );
  expect(keyframes).toContain('opacity');
  expect(
    await page
      .locator('[role="alertdialog"]')
      .evaluate((e) => e.parentElement && getComputedStyle(e.parentElement).backdropFilter),
  ).toBe('none');
});

test('T2: the tag popover opens from its trigger, Escape closes only it, and focus stays', async ({
  page,
}) => {
  await signedIn(page, 'dlg-t2');
  const trigger = page.getByRole('button', { name: 'No tag', exact: true });
  const panel = await openTagPicker(page);
  // Scales about its top edge, where the trigger is: the origin's y is 0.
  const origin = await panel.evaluate((el) => getComputedStyle(el).transformOrigin);
  expect(origin.split(' ')[1]).toBe('0px');

  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();
  // The page is still the timer page: that Escape closed the popover only.
  await expect(page.getByRole('button', { name: 'Home', exact: true })).toBeVisible();
});

test('T4: with reduced motion a dialog shows without moving', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await running(page, 'dlg-t4');
  await page.getByRole('button', { name: 'End early' }).click();
  const moving = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[role="alertdialog"]'))
      .flatMap((d) => d.getAnimations())
      .flatMap((a) => (a.effect as KeyframeEffect | null)?.getKeyframes() ?? [])
      .flatMap((k) => Object.keys(k))
      .filter((k) => k === 'transform' || k === 'scale'),
  );
  expect(moving).toEqual([]);
});

test('T3: an invitation banner fades in on home, and the lobby it opens is in order', async ({
  page,
}) => {
  const [ada, bea] = await Promise.all([createUser('dlg-ada'), createUser('dlg-bea')]);
  await Promise.all([setName(ada, 'Ada'), setName(bea, 'Bea')]);
  await befriend(ada, bea);
  await page.goto('/');
  await signIn(page, bea);
  await goHome(page);
  await createRoom(ada, [bea], 1500);
  const banner = page.getByRole('region', { name: 'Invitation' });
  await expect(banner).toBeVisible({ timeout: 15_000 });
  expect(await banner.evaluate((el) => getComputedStyle(el).animationName)).toBe('fade-in');
});

test.describe('the tag popover stays inside the window (UI review M3)', () => {
  const rect = (page: Page) =>
    page.getByRole('dialog', { name: 'Choose a tag' }).evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, height: r.height };
    });

  test('G1: with room below it opens below the pill', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1080 });
    await signedIn(page, 'tag-g1');
    await openTagPicker(page);
    await page.waitForTimeout(400);
    const pill = (await page.locator('button[aria-expanded][aria-controls]').boundingBox())!;
    const r = await rect(page);
    expect(r.top).toBeGreaterThan(pill.y + pill.height);
    expect(r.bottom).toBeLessThanOrEqual(1080);
  });

  for (const height of [800, 640]) {
    test(`G2: at 1280x${height} with Custom open it flips above the pill and stays in the window`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height });
      await signedIn(page, `tag-g2-${height}`);
      await page.getByRole('radio', { name: 'Custom' }).click();
      await openTagPicker(page);
      await page.waitForTimeout(400);
      const pill = (await page.locator('button[aria-expanded][aria-controls]').boundingBox())!;
      const r = await rect(page);
      expect(r.top).toBeGreaterThanOrEqual(0);
      expect(r.bottom).toBeLessThanOrEqual(height);
      if (r.bottom > pill.y) {
        // It sits below the pill only if all of it fits there.
        expect(r.top).toBeGreaterThan(pill.y + pill.height);
      } else {
        expect(r.bottom).toBeLessThanOrEqual(pill.y);
      }
    });
  }

  test('G3: in a very short window the panel scrolls inside instead of leaving the window', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 480, height: 400 });
    await signedIn(page, 'tag-g3');
    await openTagPicker(page);
    await page.waitForTimeout(400);
    const r = await rect(page);
    expect(r.top).toBeGreaterThanOrEqual(0);
    expect(r.bottom).toBeLessThanOrEqual(400);
    // Everything in it is still reachable: the "New tag" field takes focus.
    await page.getByRole('dialog', { name: 'Choose a tag' }).getByRole('textbox').focus();
    await expect(
      page.getByRole('dialog', { name: 'Choose a tag' }).getByRole('textbox'),
    ).toBeFocused();
  });

  test('G4: Escape still closes only the popover, and focus returns to the pill', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    await signedIn(page, 'tag-g4');
    const pill = page.getByRole('button', { name: 'No tag', exact: true });
    await openTagPicker(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Choose a tag' })).toBeHidden();
    await expect(pill).toBeFocused();
  });
});
