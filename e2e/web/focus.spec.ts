import { expect, test, type Locator, type Page } from '@playwright/test';

import { expectSignedIn, openTagPicker, signIn, stardustPill } from '../support/app';
import { startClockInThePast } from '../support/clock';
import { createUser } from '../support/users';

/**
 * Keyboard focus never falls to the page when the control that had it goes
 * away: closing a panel, "Done" on a result, picking a tag, and the delete
 * account box all hand focus to the next sensible control.
 */

const press = async (target: Locator, key: string) => {
  await target.focus();
  await target.press(key);
};

const signedIn = async (page: Page, label: string) => {
  const user = await createUser(label);
  await startClockInThePast(page);
  await page.goto('/');
  await signIn(page, user);
  await expectSignedIn(page);
};

test('closing a panel hands focus back to the button that opened it', async ({ page }) => {
  await signedIn(page, 'focus-panels');
  const back = page.getByRole('button', { name: 'Back to timer' });
  const openers: Array<[string, Locator]> = [
    ['View sky', page.getByRole('button', { name: 'View sky', exact: true })],
    ['Stats', page.getByRole('button', { name: 'Stats', exact: true })],
    ['Stardust', stardustPill(page)],
    ['Friends', page.getByRole('button', { name: /^Friends(,|$)/ })],
    ['Account', page.getByRole('button', { name: 'Account', exact: true })],
  ];

  for (const [name, opener] of openers) {
    await test.step(`${name}, closed with Escape`, async () => {
      await press(opener, 'Enter');
      await expect(back).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(opener).toBeFocused();
    });
    await test.step(`${name}, closed with Back to timer`, async () => {
      await press(opener, 'Enter');
      await expect(back).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(opener).toBeFocused();
    });
  }
});

test('"Done" on a finished session lands on Start', async ({ page }) => {
  await signedIn(page, 'focus-done');
  await press(page.getByRole('button', { name: 'Start 25 min' }), 'Enter');
  await expect(page.getByRole('timer')).toContainText('25:00');

  await page.clock.fastForward('25:01');
  const done = page.getByRole('button', { name: 'Done' });
  await expect(done).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page.getByRole('button', { name: 'Start 25 min' })).toBeFocused();
});

test('picking a tag keeps focus on the tag button', async ({ page }) => {
  await signedIn(page, 'focus-tag');
  const pill = page.getByRole('button', { name: 'No tag', exact: true, expanded: false });
  await press(pill, 'Enter');
  const panel = await openTagPicker(page);

  await press(panel.getByRole('button', { name: 'No tag', pressed: true }), 'Enter');

  await expect(panel).toBeHidden();
  await expect(pill).toBeFocused();
});

test('arrow keys move through the idle screen’s choices and nothing else moves', async ({
  page,
}) => {
  await signedIn(page, 'focus-radios');
  const radio = (name: string) => page.getByRole('radio', { name, exact: true });
  const modeToggle = page.getByRole('radiogroup', { name: 'Session type' });
  const toggleTop = async () => (await modeToggle.boundingBox())?.y;
  const top = await toggleTop();

  // Length: one Tab stop, and an arrow selects the next segment.
  await radio('25 min').focus();
  await page.keyboard.press('ArrowRight');
  await expect(radio('50 min')).toBeFocused();
  await expect(radio('50 min')).toBeChecked();
  await expect(page.getByText('50:00')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start 50 min' })).toBeVisible();

  // Through 90 min to Custom: the slider opens, focus stays, the toggle doesn't move.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(radio('Custom')).toBeFocused();
  await expect(radio('Custom')).toBeChecked();
  await expect(
    page.getByRole('slider', { name: 'Custom session length in minutes' }),
  ).toBeVisible();
  expect(await toggleTop()).toBe(top);

  // Mode: Right from Countdown picks Pomodoro, focus stays, the toggle still doesn't move.
  await radio('Countdown').focus();
  await page.keyboard.press('ArrowRight');
  await expect(radio('Pomodoro')).toBeFocused();
  await expect(radio('Pomodoro')).toBeChecked();
  await expect(page.getByRole('button', { name: 'Start Pomodoro' })).toBeVisible();
  expect(await toggleTop()).toBe(top);
});

test('the delete account box takes focus when it opens and gives it back on Cancel', async ({
  page,
}) => {
  await signedIn(page, 'focus-delete');
  await press(page.getByRole('button', { name: 'Account', exact: true }), 'Enter');
  // Opening the panel still lands on its Back button, not the delete control.
  await expect(page.getByRole('button', { name: 'Back to timer' })).toBeFocused();

  await press(page.getByRole('button', { name: 'Delete account…' }), 'Enter');
  await expect(page.getByLabel('Type your email address to confirm')).toBeFocused();

  await press(page.getByRole('button', { name: 'Cancel' }), 'Enter');
  await expect(page.getByRole('button', { name: 'Delete account…' })).toBeFocused();
});
