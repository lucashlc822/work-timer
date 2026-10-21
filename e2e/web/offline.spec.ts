import { expect, test, type Page } from '@playwright/test';

import {
  backToTimer,
  expectSignedIn,
  openView,
  signIn,
  stardustPill,
  syncLine,
} from '../support/app';
import { startClockInThePast } from '../support/clock';
import { adminClient, createUser } from '../support/users';

/**
 * Offline use: the installed shell opens with no network, a session can be
 * finished and kept on the device, and everything reaches the server once the
 * connection returns.
 */

/**
 * Waits until the service worker controls the page. The first visit installs
 * the worker but is not itself served by it, so a reload may be needed;
 * without this the "offline reload" below would be a plain failed request and
 * the test would prove nothing about the offline shell.
 */
const waitForServiceWorkerControl = async (page: Page): Promise<void> => {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  if (!(await page.evaluate(() => navigator.serviceWorker.controller !== null))) {
    await page.reload();
  }
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
    timeout: 20_000,
  });
};

test('the app opens offline, a session finishes offline, and it all uploads when the network returns', async ({
  page,
  context,
}) => {
  const user = await createUser('offline');
  await startClockInThePast(page);
  await page.goto('/');
  await signIn(page, user);
  await expectSignedIn(page);
  await waitForServiceWorkerControl(page);
  // Signed in and synced before the network goes.
  await openView(page, 'Account');
  await expect(syncLine(page)).toContainText('Backed up', { timeout: 20_000 });
  await backToTimer(page);

  await context.setOffline(true);
  await page.reload();

  // The shell came from the worker (the page is controlled by it again after
  // the offline reload), and the account from the device.
  await expectSignedIn(page);
  expect(await page.evaluate(() => navigator.serviceWorker.controller?.state)).toBe('activated');
  await expect(page.getByRole('button', { name: 'Start 25 min' })).toBeVisible();

  await page.getByRole('button', { name: 'Start 25 min' }).click();
  await expect(page.getByRole('timer')).toBeVisible();
  await page.clock.fastForward('25:01');
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(stardustPill(page)).toHaveText(/\b25 Stardust$/);

  // The device says plainly that it is offline with changes waiting.
  await openView(page, 'Account');
  await expect(syncLine(page)).toHaveText(/^Offline · \d+ changes? waiting$/, {
    timeout: 30_000,
  });

  // Nothing reached the server while offline.
  const before = await adminClient().from('sessions').select('id').eq('user_id', user.id);
  expect(before.error).toBeNull();
  expect(before.data).toEqual([]);

  await context.setOffline(false);

  await expect(syncLine(page)).toContainText('Backed up', { timeout: 30_000 });
  await expect(syncLine(page)).not.toContainText('waiting');
  const sessions = await adminClient()
    .from('sessions')
    .select('outcome, actual_focus_s')
    .eq('user_id', user.id);
  expect(sessions.data).toEqual([{ outcome: 'completed', actual_focus_s: 1500 }]);
  const ledger = await adminClient().from('ledger').select('delta').eq('user_id', user.id);
  expect(ledger.data?.reduce((sum, row: { delta: number }) => sum + row.delta, 0)).toBe(25);
});

/**
 * The control for the test above: with the service worker blocked, the same
 * offline reload cannot load the app. This is what shows the test above is
 * really exercising the offline shell and not a cached page by accident.
 */
test.describe('without a service worker', () => {
  test.use({ serviceWorkers: 'block' });

  test('an offline reload cannot open the app', async ({ page, context }) => {
    const user = await createUser('offline-control');
    await page.goto('/');
    await signIn(page, user);
    await expectSignedIn(page);

    await context.setOffline(true);
    await expect(page.reload()).rejects.toThrow(/ERR_INTERNET_DISCONNECTED/);
  });
});
