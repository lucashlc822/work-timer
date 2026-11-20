import { expect, test } from '@playwright/test';

import { expectSignedIn, openView, signIn } from '../support/app';
import { createUser } from '../support/users';

/**
 * UI review M5: a server that accepts a request and never answers must not
 * leave Account on a bare "Syncing…". Real clock: the wait is the page's own.
 */
test.use({ viewport: { width: 480, height: 720 } });

test('S1: a sync round the server never answers says it is still trying, then settles when it gives up', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const user = await createUser('sync-slow');
  await page.goto('/');
  await signIn(page, user);
  await expectSignedIn(page);
  await openView(page, 'Account');

  // From here the server takes every data request and never replies.
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/rest/v1/**', async (route) => {
    await held;
    await route.abort();
  });
  const line = page.getByRole('region', { name: 'Sync' }).getByRole('status');
  await page.getByRole('button', { name: 'Sync now' }).click();
  await expect(line).toHaveText('Syncing…');
  await expect(line).toHaveText(/Still trying to reach the server…/, { timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Sync now' })).toBeDisabled();

  // The request finally fails: the round settles on the honest outcome.
  release();
  await expect(line).toHaveText(/Couldn.t (reach the server|sync)/, { timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Sync now' })).toBeEnabled();
});
