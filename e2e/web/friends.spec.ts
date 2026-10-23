import { expect, test, type Page } from '@playwright/test';

import { backToTimer, expectSignedIn, openFriends, sessionsOnDevice, signIn } from '../support/app';
import { closeDevices, openDevice } from '../support/devices';
import {
  addCompletedSession,
  befriend,
  friendCode,
  requestFriend,
  setName,
  unfriend,
} from '../support/friends';
import { createUser } from '../support/users';

/**
 * The Friends panel (M7 phase 2), on two devices that are two people: picking
 * a name, sharing a code, requests, and visiting a friend's sky.
 */

const BASE = 'http://127.0.0.1:4174';

const addFriend = (page: Page) => page.getByRole('textbox', { name: 'Add a friend' });
const sendRequest = (page: Page) => page.getByRole('button', { name: 'Send request' });

const pickName = async (page: Page, name: string) => {
  await page.getByRole('textbox', { name: /name/ }).fill(name);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
};

const send = async (page: Page, code: string) => {
  await addFriend(page).fill(code);
  await sendRequest(page).click();
};

test('pick a name, share a code, and become friends in three steps', async ({ browser }) => {
  const ada = await createUser('fr-ada');
  const bea = await createUser('fr-bea');
  const a = await openDevice(browser, BASE, ada);
  const b = await openDevice(browser, BASE, bea);
  await a.context.grantPermissions(['clipboard-read', 'clipboard-write']);

  try {
    // 1.2 / 1.3: no name yet, so no requests; bad names are refused.
    await openFriends(a.page);
    await expect(a.page.getByText('Pick a name your friends will see')).toBeVisible();
    await expect(sendRequest(a.page)).toBeDisabled();
    await a.page.getByRole('textbox', { name: /name/ }).fill('x'.repeat(25));
    await a.page.getByRole('button', { name: 'Save' }).click();
    await expect(a.page.getByRole('alert')).toHaveText(
      'Names are 1 to 24 characters, on one line.',
    );
    await pickName(a.page, 'Ada');

    const shown = a.page.getByTestId('friend-code');
    await expect(shown).toHaveText(/^[23456789A-HJ-NP-Z]{3}-[23456789A-HJ-NP-Z]{3}$/);
    expect((await shown.innerText()).replace('-', '')).toBe(await friendCode(ada));
    await a.page.getByRole('button', { name: 'Copy' }).click();
    await expect(a.page.getByRole('button', { name: 'Copied' })).toBeVisible();
    expect(await a.page.evaluate(() => navigator.clipboard.readText())).toBe(
      await shown.innerText(),
    );

    await openFriends(b.page);
    await pickName(b.page, 'Bea');
    const beaCode = await friendCode(bea);

    // 2.2: mistakes are explained; then the real request.
    await send(a.page, 'AB');
    await expect(a.page.getByRole('alert')).toHaveText(
      'No one has that code. Check it and try again.',
    );
    await send(a.page, await friendCode(ada));
    await expect(a.page.getByRole('alert')).toHaveText("That's your own code.");
    // Typed the way people type: lower case, with the hyphen.
    await send(a.page, `${beaCode.slice(0, 3)}-${beaCode.slice(3)}`.toLowerCase());
    await expect(a.page.getByRole('status')).toHaveText('Request sent to Bea.');
    await expect(a.page.getByText('Waiting for Bea')).toBeVisible();
    await send(a.page, beaCode);
    await expect(a.page.getByRole('alert')).toHaveText('You already sent them a request.');

    // 2.1: Bea sees it on the pill when the app comes back into view.
    await backToTimer(b.page);
    await b.page.reload();
    await expect(b.page.getByRole('button', { name: 'Friends, 1 request waiting' })).toBeVisible();
    await expect(b.page.getByRole('button', { name: 'Friends, 1 request waiting' })).toHaveText(
      'Friends · 1',
    );
    await openFriends(b.page);
    await expect(b.page.getByText('Ada wants to be friends')).toBeVisible();
    await b.page.getByRole('button', { name: 'Accept' }).click();
    const beaList = b.page.getByRole('region', { name: 'Friends' });
    await expect(beaList.getByRole('button', { name: /^Ada/ })).toBeVisible();
    await expect(b.page.getByRole('button', { name: 'Friends', exact: true })).toBeAttached();

    await backToTimer(a.page);
    await a.page.reload();
    await openFriends(a.page);
    await expect(
      a.page.getByRole('region', { name: 'Friends' }).getByRole('button', { name: /^Bea/ }),
    ).toBeVisible();

    // 2.3: removing, after a confirm step, ends it on both sides.
    await a.page.getByRole('button', { name: 'Remove Bea' }).click();
    await a.page.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(a.page.getByText('No friends yet. Share your code, or add theirs.')).toBeVisible();
    await backToTimer(b.page);
    await b.page.reload();
    await openFriends(b.page);
    await expect(b.page.getByText('No friends yet. Share your code, or add theirs.')).toBeVisible();
  } finally {
    await closeDevices(a, b);
  }
});

test('declining, cancelling, and a request that crosses another', async ({ browser }) => {
  const ada = await createUser('fr-ada2');
  const bea = await createUser('fr-bea2');
  await setName(ada, 'Ada');
  await setName(bea, 'Bea');
  const a = await openDevice(browser, BASE, ada);

  try {
    // Ada cancels her own request.
    await openFriends(a.page);
    await send(a.page, await friendCode(bea));
    await expect(a.page.getByText('Waiting for Bea')).toBeVisible();
    await a.page.getByRole('button', { name: 'Cancel' }).click();
    await expect(a.page.getByText('Waiting for Bea')).toBeHidden();

    // Bea asks Ada; Ada declines.
    await requestFriend(bea, ada);
    await backToTimer(a.page);
    await a.page.reload();
    await openFriends(a.page);
    await a.page.getByRole('button', { name: 'Decline' }).click();
    await expect(a.page.getByText('Bea wants to be friends')).toBeHidden();

    // Bea asks again, and Ada happens to enter Bea's code: they're friends.
    await requestFriend(bea, ada);
    await send(a.page, await friendCode(bea));
    await expect(a.page.getByRole('status')).toHaveText("You're now friends with Bea.");
    await expect(
      a.page.getByRole('region', { name: 'Friends' }).getByRole('button', { name: /^Bea/ }),
    ).toBeVisible();
  } finally {
    await closeDevices(a);
  }
});

test('a friend’s sky, its numbers, and what happens when the friendship ends', async ({
  browser,
}) => {
  const ada = await createUser('fr-ada3');
  const bea = await createUser('fr-bea3');
  await setName(ada, 'Ada');
  await setName(bea, 'Bea');
  await befriend(ada, bea);
  // Ada focused for 25 minutes, ending 5 minutes ago.
  await addCompletedSession(ada, 25);

  const b = await openDevice(browser, BASE, bea);
  try {
    await openFriends(b.page);
    const ada_ = b.page
      .getByRole('region', { name: 'Friends' })
      .getByRole('button', { name: /^Ada/ });
    await expect(ada_).toContainText('Focused today');

    // 3.4: her sky, full screen, with her numbers.
    await ada_.click();
    await expect(b.page.getByRole('heading', { name: "Ada's sky" })).toBeVisible();
    const numbers = b.page.getByRole('definition');
    await expect(numbers).toHaveText(['25 min', '1', '1 day', '0']);
    await b.page.keyboard.press('Escape');
    await expect(b.page.getByRole('heading', { name: 'Friends', level: 2 })).toBeVisible();
    await ada_.click();
    await b.page.getByRole('button', { name: 'Back to friends' }).click();
    await expect(b.page.getByRole('heading', { name: 'Friends', level: 2 })).toBeVisible();

    // 5.3: none of it was written into Bea's own store.
    await backToTimer(b.page);
    expect(await sessionsOnDevice(b.page)).toBe(0);

    // 3.5: Ada removes Bea while Bea's list still shows her.
    await openFriends(b.page);
    await unfriend(ada);
    await ada_.click();
    await expect(b.page.getByRole('alert')).toHaveText("You're no longer friends.");
    await b.page.getByRole('button', { name: 'Back to friends' }).click();
    await expect(b.page.getByText('No friends yet. Share your code, or add theirs.')).toBeVisible();

    // 4.1: the server out of reach, then back.
    await b.page.route('**/rest/v1/**', (route) => route.abort('internetdisconnected'));
    await b.page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(b.page.getByText('Connect to see your friends.')).toBeVisible();
    await b.page.unroute('**/rest/v1/**');
    await b.page.getByRole('button', { name: 'Try again' }).click();
    await expect(b.page.getByText('Connect to see your friends.')).toBeHidden();
  } finally {
    await closeDevices(b);
  }
});

test('a friend sees you focusing, then on a break, within about 15 seconds', async ({
  browser,
}) => {
  const ada = await createUser('fr-ada4');
  const bea = await createUser('fr-bea4');
  await setName(ada, 'Ada');
  await setName(bea, 'Bea');
  await befriend(ada, bea);

  const a = await openDevice(browser, BASE, ada);
  const b = await openDevice(browser, BASE, bea);
  try {
    await openFriends(b.page);
    const adaRow = b.page
      .getByRole('region', { name: 'Friends' })
      .getByRole('button', { name: /^Ada/ });
    await expect(adaRow).toContainText('Not focused yet');

    // 3.1: Ada starts; Bea's open panel shows it on its next check.
    await a.page.getByRole('button', { name: 'Start 25 min' }).click();
    await expect(a.page.getByRole('timer')).toBeVisible();
    await expect(adaRow).toContainText(/Focusing now · 2[45] min left/, { timeout: 20_000 });

    // 3.4: the same line on her sky.
    await adaRow.click();
    await expect(b.page.getByText(/Focusing now · 2[45] min left/)).toBeVisible();
    await b.page.getByRole('button', { name: 'Back to friends' }).click();

    // 3.2: Ada ends early; Bea's row goes back to how it was.
    await a.page.getByRole('button', { name: 'End early' }).click();
    await a.page.getByRole('button', { name: 'End session' }).click();
    await a.page.getByRole('button', { name: 'Done' }).click();
    await expect(adaRow).toContainText('Not focused yet', { timeout: 20_000 });
  } finally {
    await closeDevices(a, b);
  }

  // 3.3: a Pomodoro break. Ada's clock starts at real time so the block can be
  // fast-forwarded; her break then lies ahead of the server's "now", as a
  // real one would.
  const pomodoro = await browser.newContext({ baseURL: BASE });
  const page = await pomodoro.newPage();
  await page.clock.install({ time: new Date() });
  await page.goto('/');
  await signIn(page, ada);
  await expectSignedIn(page);
  const b2 = await openDevice(browser, BASE, bea);
  try {
    await page.getByRole('radio', { name: 'Pomodoro' }).click();
    await page.getByRole('button', { name: 'Start Pomodoro' }).click();
    await expect(page.getByText('Block 1 · Pomodoro')).toBeVisible();
    await page.clock.fastForward('25:01');

    await openFriends(b2.page);
    await expect(
      b2.page.getByRole('region', { name: 'Friends' }).getByRole('button', { name: /^Ada/ }),
    ).toContainText(/On a break · \d+ min left/, { timeout: 20_000 });
  } finally {
    await pomodoro.close();
    await closeDevices(b2);
  }
});
