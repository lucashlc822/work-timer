import { expect, test, type Page } from '@playwright/test';

import { expectSignedIn, openAccount, openFriends, signIn } from '../support/app';
import { closeDevices, openDevice } from '../support/devices';
import { befriend, setName } from '../support/friends';
import { adminClient, createUser, type TestUser } from '../support/users';

/**
 * Presence (M7): friends see Online, Away, Focusing, On a break or Offline.
 * Away needs a page that knows it is hidden, which a Playwright-driven page
 * never does: that half lives in the unit test (useSharePresence.test.tsx)
 * and the desktop tray test (e2e/desktop/native.spec.ts).
 */

const BASE = 'http://127.0.0.1:4174';

const presenceRow = async (user: TestUser) =>
  (await adminClient().from('presence').select('state').eq('user_id', user.id)).data;

const friendRow = (page: Page, name: string) =>
  page
    .getByRole('region', { name: 'Friends' })
    .getByRole('button', { name: new RegExp(`^${name}`) });

const pair = async (tag: string) => {
  const ada = await createUser(`pr-ada${tag}`);
  const bea = await createUser(`pr-bea${tag}`);
  await setName(ada, 'Ada');
  await setName(bea, 'Bea');
  await befriend(ada, bea);
  return { ada, bea };
};

test('C1, C3, C4: a friend with the app open is Online, Focusing while in a session, Offline once gone', async ({
  browser,
}) => {
  const { ada, bea } = await pair('1');
  const a = await openDevice(browser, BASE, ada);
  const b = await openDevice(browser, BASE, bea);
  try {
    await openFriends(b.page);
    const row = friendRow(b.page, 'Ada');

    // C1: Ada's app is open and in view.
    await expect(row).toContainText('Online', { timeout: 20_000 });
    await expect(row.locator('[data-status]')).toHaveAttribute('data-status', 'online');

    // C3: focusing wins over being online.
    await a.page.getByRole('button', { name: 'Start 25 min' }).click();
    await expect(a.page.getByRole('timer')).toBeVisible();
    await expect(row).toContainText(/Focusing now · 2[45] min left/, { timeout: 20_000 });
    await expect(row).not.toContainText('Online');
    await expect(row.locator('[data-status]')).toHaveAttribute('data-status', 'focusing');

    // C4: Ada closes the app. Whether or not the goodbye reaches the server,
    // a row nobody refreshes for three minutes is gone; move hers back so the
    // test needn't wait.
    await a.page.getByRole('button', { name: 'End early' }).click();
    await a.page.getByRole('button', { name: 'End session' }).click();
    await closeDevices(a);
    await adminClient()
      .from('presence')
      .update({ seen_at: new Date(Date.now() - 4 * 60_000).toISOString() })
      .eq('user_id', ada.id);
    await expect(row).toContainText('Offline · Not focused yet', { timeout: 20_000 });
    await expect(row.locator('[data-status]')).toHaveAttribute('data-status', 'offline');
  } finally {
    await closeDevices(a, b);
  }
});

test('C5: "Show when I’m online" off: friends see Offline at once, and still see focusing', async ({
  browser,
}) => {
  const { ada, bea } = await pair('2');
  const a = await openDevice(browser, BASE, ada);
  const b = await openDevice(browser, BASE, bea);
  try {
    await expect.poll(() => presenceRow(ada), { timeout: 15_000 }).toEqual([{ state: 'online' }]);
    await openFriends(b.page);
    const row = friendRow(b.page, 'Ada');
    await expect(row).toContainText('Online', { timeout: 20_000 });

    await openAccount(a.page);
    const toggle = a.page.getByRole('checkbox', { name: 'Show when I’m online' });
    await expect(toggle).toBeChecked();
    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await expect.poll(() => presenceRow(ada), { timeout: 10_000 }).toEqual([]);
    await expect(row).toContainText('Offline', { timeout: 20_000 });

    // Still off after a reload (it's the server's setting, not this page's).
    await a.page.reload();
    await expectSignedIn(a.page);
    await openAccount(a.page);
    await expect(a.page.getByRole('checkbox', { name: 'Show when I’m online' })).not.toBeChecked();
    expect(await presenceRow(ada)).toEqual([]);

    // Focusing is shared regardless.
    await a.page.getByRole('button', { name: 'Back to timer' }).click();
    await a.page.getByRole('button', { name: 'Start 25 min' }).click();
    await expect(row).toContainText(/Focusing now/, { timeout: 20_000 });
  } finally {
    await closeDevices(a, b);
  }
});

test('C7: an idle open app sends about one presence a minute', async ({ browser }) => {
  const user = await createUser('pr-idle');
  const context = await browser.newContext({ baseURL: BASE });
  const page = await context.newPage();
  // Real time, so the server accepts what's sent; the clock only skips ahead.
  await page.clock.install({ time: new Date() });
  await page.goto('/');
  await signIn(page, user);
  await expectSignedIn(page);
  try {
    await expect.poll(() => presenceRow(user), { timeout: 15_000 }).toEqual([{ state: 'online' }]);
    let sent = 0;
    page.on('request', (r) => {
      if (r.url().includes('/rpc/set_presence')) sent += 1;
    });
    // Jumps, not runFor: running every frame of the sky for a minute is slow.
    for (let minute = 0; minute < 3; minute++) await page.clock.fastForward('01:00');
    await expect.poll(() => sent, { timeout: 10_000 }).toBeGreaterThanOrEqual(3);
    expect(sent).toBeLessThanOrEqual(4);
  } finally {
    await context.close();
  }
});
