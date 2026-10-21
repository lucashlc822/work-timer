import { expect, test, type Page } from '@playwright/test';

import { backToTimer, openView, sessionsOnDevice, stardustPill, syncLine } from '../support/app';
import { closeDevices, openDevice, renameTag, tagNames } from '../support/devices';
import { adminClient, createUser, newId, type TestUser } from '../support/users';

/**
 * Two devices, one account. Each device is its own browser context with its
 * own IndexedDB; "going offline" cuts that context's network, edits are made
 * on both, and the order they reconnect in is chosen by the test. The rules
 * under test (CLAUDE.md, "Decisions"): tags and settings are last-write-wins
 * on `updated_at`, sessions are insert-only and merge, and a purchase is one
 * deduction however many offline devices made it.
 *
 * Every wait is on the server's rows or the screen, never a fixed sleep,
 * except the one-second gap that keeps two edits' timestamps apart.
 */

const BASE_URL = 'http://127.0.0.1:4174';
const EDIT_GAP_MS = 1100;

const serverTags = async (user: TestUser) => {
  const { data, error } = await adminClient()
    .from('tags')
    .select('name')
    .eq('user_id', user.id)
    .order('name');
  expect(error).toBeNull();
  return (data ?? []).map((row: { name: string }) => row.name);
};

interface SettingsRow {
  mode: string;
  pomodoro: Record<string, unknown>;
}

const serverSettings = async (user: TestUser) => {
  const { data, error } = await adminClient()
    .from('user_settings')
    .select('mode, pomodoro')
    .eq('user_id', user.id)
    .maybeSingle<SettingsRow>();
  expect(error).toBeNull();
  return data;
};

const seedTag = async (user: TestUser, name: string) => {
  const now = new Date().toISOString();
  const { error } = await adminClient().from('tags').insert({
    id: newId(),
    user_id: user.id,
    name,
    color: 'mint',
    created_at: now,
    updated_at: now,
  });
  expect(error).toBeNull();
};

const seedStardust = async (user: TestUser, amount: number) => {
  const { error } = await adminClient().from('ledger').insert({
    id: newId(),
    user_id: user.id,
    reason: 'e2e',
    delta: amount,
    ref: 'e2e-seed',
    created_at: new Date().toISOString(),
  });
  expect(error).toBeNull();
};

const chooseMode = async (page: Page, mode: 'Countdown' | 'Pomodoro') => {
  await page.getByRole('radio', { name: mode }).click();
  await expect(page.getByRole('radio', { name: mode })).toBeChecked();
};

// --- tags: the later edit wins, whichever reconnects first -------------------

for (const order of ['later edit reconnects first', 'earlier edit reconnects first'] as const) {
  test(`a tag renamed on both devices: the later edit wins (${order})`, async ({ browser }) => {
    const user = await createUser('tagrace');
    await seedTag(user, 'Start');
    const one = await openDevice(browser, BASE_URL, user);
    const two = await openDevice(browser, BASE_URL, user);
    try {
      await expect.poll(() => tagNames(one.page), { timeout: 20_000 }).toEqual(['Start']);
      await expect.poll(() => tagNames(two.page), { timeout: 20_000 }).toEqual(['Start']);

      await one.context.setOffline(true);
      await two.context.setOffline(true);

      await renameTag(one.page, 'Start', 'Earlier edit');
      await one.page.waitForTimeout(EDIT_GAP_MS);
      await renameTag(two.page, 'Start', 'Later edit');
      expect(await tagNames(one.page)).toEqual(['Earlier edit']);
      expect(await tagNames(two.page)).toEqual(['Later edit']);

      const [first, second] = order === 'later edit reconnects first' ? [two, one] : [one, two];
      await first.context.setOffline(false);
      await expect
        .poll(() => serverTags(user), { timeout: 20_000 })
        .toEqual([first === two ? 'Later edit' : 'Earlier edit']);

      await second.context.setOffline(false);
      // Whatever arrived second, the later edit is what the server keeps...
      await expect.poll(() => serverTags(user), { timeout: 20_000 }).toEqual(['Later edit']);
      // ...and both devices end up showing it.
      await expect.poll(() => tagNames(one.page), { timeout: 20_000 }).toEqual(['Later edit']);
      await expect.poll(() => tagNames(two.page), { timeout: 20_000 }).toEqual(['Later edit']);
    } finally {
      await closeDevices(one, two);
    }
  });
}

// --- settings: the newest whole settings win ---------------------------------

test('settings changed on both devices: the newest edit wins on both', async ({ browser }) => {
  const user = await createUser('settingsrace');
  const one = await openDevice(browser, BASE_URL, user);
  const two = await openDevice(browser, BASE_URL, user);
  try {
    await one.context.setOffline(true);
    await two.context.setOffline(true);

    await chooseMode(one.page, 'Pomodoro');
    await one.page.waitForTimeout(EDIT_GAP_MS);
    await chooseMode(two.page, 'Pomodoro');
    await two.page.getByLabel('Focus in minutes').fill('50');
    await expect(two.page.getByText('50 min focus')).toBeVisible();
    await expect(one.page.getByText('25 min focus')).toBeVisible();

    // The older edit reconnects last, so it must lose by time, not by arrival.
    await two.context.setOffline(false);
    await expect
      .poll(async () => (await serverSettings(user))?.mode, { timeout: 20_000 })
      .toBe('pomodoro');
    await one.context.setOffline(false);

    await expect(one.page.getByText('50 min focus')).toBeVisible({ timeout: 30_000 });
    await expect(two.page.getByText('50 min focus')).toBeVisible();
    const settings = await serverSettings(user);
    expect(settings?.mode).toBe('pomodoro');
    expect(Number(settings?.pomodoro.focus_s ?? settings?.pomodoro.focusS)).toBe(3000);
  } finally {
    await closeDevices(one, two);
  }
});

// --- sessions: both are kept, Stardust is counted once each ------------------

test('a session finished offline on each device: both are kept, 50 Stardust, no double counting', async ({
  browser,
}) => {
  const user = await createUser('sessions');
  const one = await openDevice(browser, BASE_URL, user, { clockMinutesAgo: 180 });
  const two = await openDevice(browser, BASE_URL, user, { clockMinutesAgo: 90 });
  try {
    await one.context.setOffline(true);
    await two.context.setOffline(true);

    for (const device of [one, two]) {
      await device.page.getByRole('button', { name: 'Start 25 min' }).click();
      await expect(device.page.getByRole('timer')).toBeVisible();
      await device.page.clock.fastForward('25:01');
      await expect(device.page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
      await device.page.getByRole('button', { name: 'Done' }).click();
      await expect(stardustPill(device.page)).toHaveText(/\b25 Stardust$/);
    }

    await one.context.setOffline(false);
    await two.context.setOffline(false);

    await expect(stardustPill(one.page)).toHaveText(/\b50 Stardust$/, { timeout: 30_000 });
    await expect(stardustPill(two.page)).toHaveText(/\b50 Stardust$/, { timeout: 30_000 });

    const sessions = await adminClient().from('sessions').select('id').eq('user_id', user.id);
    expect(sessions.data).toHaveLength(2);

    // Each device holds BOTH sessions in its own history (Stardust alone
    // wouldn't show that: the ledger rows travel separately from the sessions).
    await expect.poll(() => sessionsOnDevice(one.page), { timeout: 20_000 }).toBe(2);
    await expect.poll(() => sessionsOnDevice(two.page), { timeout: 20_000 }).toBe(2);

    // Let both devices' reconcilers run again over the merged history, then
    // check nothing was paid twice: exactly one ledger row per session.
    for (const device of [one, two]) {
      await openView(device.page, 'Account');
      await device.page.getByRole('button', { name: 'Sync now' }).click();
      await expect(syncLine(device.page)).toContainText('Backed up', { timeout: 20_000 });
      await backToTimer(device.page);
    }
    const ledger = await adminClient()
      .from('ledger')
      .select('delta, reason')
      .eq('user_id', user.id);
    expect(ledger.data).toHaveLength(2);
    expect(ledger.data?.reduce((sum, row: { delta: number }) => sum + row.delta, 0)).toBe(50);
    await expect(stardustPill(one.page)).toHaveText(/\b50 Stardust$/);
    await expect(stardustPill(two.page)).toHaveText(/\b50 Stardust$/);
  } finally {
    await closeDevices(one, two);
  }
});

// --- shop: one item bought twice offline is one deduction --------------------

test('the same shop item bought on both offline devices is deducted once', async ({ browser }) => {
  const user = await createUser('purchase');
  await seedStardust(user, 1000);
  const one = await openDevice(browser, BASE_URL, user);
  const two = await openDevice(browser, BASE_URL, user);
  try {
    await expect(stardustPill(one.page)).toHaveText(/\b1,000 Stardust$/, { timeout: 20_000 });
    await expect(stardustPill(two.page)).toHaveText(/\b1,000 Stardust$/, { timeout: 20_000 });

    await one.context.setOffline(true);
    await two.context.setOffline(true);

    for (const device of [one, two]) {
      await stardustPill(device.page).click();
      const ember = device.page.getByRole('listitem').filter({ hasText: 'Ember' });
      await ember.getByRole('button', { name: /^Buy/ }).click();
      await expect(ember.getByRole('button', { name: /Equip|Equipped/ })).toBeVisible();
      await device.page.getByRole('button', { name: 'Back to timer' }).click();
      await expect(stardustPill(device.page)).toHaveText(/\b700 Stardust$/);
    }

    await one.context.setOffline(false);
    await two.context.setOffline(false);

    await expect
      .poll(
        async () => {
          const { data } = await adminClient()
            .from('ledger')
            .select('delta')
            .eq('user_id', user.id)
            .eq('reason', 'purchase');
          return data;
        },
        { timeout: 30_000 },
      )
      .toEqual([{ delta: -300 }]);

    await expect(stardustPill(one.page)).toHaveText(/\b700 Stardust$/, { timeout: 30_000 });
    await expect(stardustPill(two.page)).toHaveText(/\b700 Stardust$/, { timeout: 30_000 });
    const total = await adminClient().from('ledger').select('delta').eq('user_id', user.id);
    expect(total.data?.reduce((sum, row: { delta: number }) => sum + row.delta, 0)).toBe(700);
  } finally {
    await closeDevices(one, two);
  }
});

// --- a running Pomodoro run keeps its own lengths ----------------------------

test('settings arriving through sync do not change a Pomodoro run already in progress', async ({
  browser,
}) => {
  const user = await createUser('runkeeps');
  const one = await openDevice(browser, BASE_URL, user);
  const two = await openDevice(browser, BASE_URL, user);
  try {
    await chooseMode(one.page, 'Pomodoro');
    await one.page.getByRole('button', { name: 'Start Pomodoro' }).click();
    await expect(one.page.getByText('Block 1 · Pomodoro')).toBeVisible();
    await expect(one.page.getByText(/^25 minutes · ends at/)).toBeVisible();

    // The other device lengthens the focus block to 50 minutes.
    await chooseMode(two.page, 'Pomodoro');
    await two.page.getByLabel('Focus in minutes').fill('50');
    await expect(two.page.getByText('50 min focus')).toBeVisible();
    await expect
      .poll(async () => (await serverSettings(user))?.mode === 'pomodoro', { timeout: 20_000 })
      .toBe(true);

    // The running device pulls it explicitly, then looks at its timer again.
    await openView(one.page, 'Account');
    await one.page.getByRole('button', { name: 'Sync now' }).click();
    await expect(syncLine(one.page)).toContainText('Backed up', { timeout: 20_000 });
    await one.page.getByRole('button', { name: 'Back to timer' }).click();
    await expect(one.page.getByText(/^25 minutes · ends at/)).toBeVisible();
    await expect(one.page.getByText('Block 1 · Pomodoro')).toBeVisible();

    // Once the run is over, the new length is what the idle screen offers.
    await one.page.getByRole('button', { name: 'End early' }).click();
    await one.page.getByRole('button', { name: 'End session' }).click();
    await one.page.getByRole('button', { name: 'Done' }).click();
    await expect(one.page.getByText('50 min focus')).toBeVisible();
  } finally {
    await closeDevices(one, two);
  }
});

// --- KNOWN DEFECT: a change made during a sync round waits for the next trigger

/**
 * Pins a real defect in the app (found writing these specs; reported in the
 * PR and NOTES.md, deliberately not fixed here).
 *
 * `useSync` uploads 2 s after something new is waiting, by calling `run()`,
 * and `engine.syncNow()` hands back the round already in flight instead of
 * starting another. If that round is past its upload step (it is pulling), it
 * finishes "successfully" without the new session, nothing schedules another,
 * and the session sits as "2 changes waiting" until some other trigger: the
 * window becoming visible, the connection returning, a change announced from
 * another device, or the five-minute check-in. In practice it needs a round
 * that lasts a while (a slow or flaky connection; the server library retries
 * failed reads), which is what the held request below stands in for.
 *
 * The assertion states the CORRECT behaviour: the session reaches the server
 * soon after the round ends, with no new trigger. `test.fail` keeps CI green
 * while the defect stands, and turns red the day it is fixed, at which point
 * delete the `test.fail` line. A second device with "2 changes waiting" and a
 * green "Backed up · synced just now" is this.
 */
test('a session finished while a sync round is in flight still uploads without another trigger', async ({
  browser,
}) => {
  test.fail(
    true,
    'Known defect: the upload joins the in-flight round and is never retried (see comment).',
  );

  const user = await createUser('inflight');
  const device = await openDevice(browser, BASE_URL, user, { clockMinutesAgo: 120 });
  try {
    // Hold the pull's first request, so a round started now stays in flight.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let held = 0;
    await device.page.route('**/rest/v1/tags*', async (route) => {
      held += 1;
      await gate;
      await route.continue();
    });
    await openView(device.page, 'Account');
    await device.page.getByRole('button', { name: 'Sync now' }).click();
    await expect.poll(() => held).toBeGreaterThan(0);
    await backToTimer(device.page);

    // A session finishes while that round is stuck, and its 2 s upload delay passes.
    await device.page.getByRole('button', { name: 'Start 25 min' }).click();
    await expect(device.page.getByRole('timer')).toBeVisible();
    await device.page.clock.fastForward('25:01');
    await expect(device.page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
    await device.page.getByRole('button', { name: 'Done' }).click();
    await device.page.waitForTimeout(3_500);

    // The round ends. The session should now go up on its own.
    release();
    await expect
      .poll(
        async () => {
          const { data } = await adminClient().from('sessions').select('id').eq('user_id', user.id);
          return data?.length;
        },
        { timeout: 15_000 },
      )
      .toBe(1);
  } finally {
    await closeDevices(device);
  }
});
