import { expect, test, type Page } from '@playwright/test';

import {
  backToTimer,
  expectSignedIn,
  openFriends,
  openView,
  sessionsOnDevice,
} from '../support/app';
import { closeDevices, openDevice } from '../support/devices';
import { befriend, rpc, setName, unfriend } from '../support/friends';
import { adminClient, createUser, newId, type TestUser } from '../support/users';

/**
 * Shared constellations (M7 phase 5), on two browser contexts that are
 * different people. Pages start their clocks two hours back so a
 * fast-forwarded session ends before the server's "now"; shared
 * constellations made through the API are dated three hours back for the same
 * reason (a session counts only if it ends after the acceptance).
 */

const BASE = 'http://127.0.0.1:4174';

const people = async (...names: string[]): Promise<TestUser[]> => {
  const users = await Promise.all(names.map((n) => createUser(`sh-${n.toLowerCase()}`)));
  await Promise.all(users.map((u, i) => setName(u, names[i]!)));
  return users;
};

const KITE = {
  source: 'catalogue',
  shape_id: 'kite',
  seed: null,
  tier: 'easy',
  stars_needed: 4,
  min_focus_s: 0,
};

/**
 * Dates a shared constellation's acceptance three hours back, so sessions from
 * pages whose clocks run two hours behind still end after it.
 */
const backdateAcceptance = async (where: { id: string } | { a: string }) => {
  const [column, value] = Object.entries(where)[0]!;
  const { error } = await adminClient()
    .from('shared_constellations')
    .update({ accepted_at: new Date(Date.now() - 3 * 3_600_000).toISOString() })
    .eq(column, value);
  expect(error).toBeNull();
};

/** Ada proposes the Kite to Bea and Bea accepts, three hours ago. */
const sharedKite = async (ada: TestUser, bea: TestUser): Promise<string> => {
  const id = (await rpc(ada, 'propose_shared', { friend: bea.id, ...KITE })) as string;
  await rpc(bea, 'respond_shared', { shared: id, accept: true });
  await backdateAcceptance({ id });
  return id;
};

const serverSessionsFor = async (user: TestUser, sharedId: string): Promise<number> => {
  const { data } = await adminClient()
    .from('sessions')
    .select('id')
    .eq('user_id', user.id)
    .eq('shared_id', sharedId);
  return data?.length ?? 0;
};

/** A completed session for `sharedId`, on the server, ending `endedMinutesAgo` ago. */
const addSharedSession = async (user: TestUser, sharedId: string, endedMinutesAgo: number) => {
  const ended = Date.now() - endedMinutesAgo * 60_000;
  const { error } = await adminClient()
    .from('sessions')
    .insert({
      id: newId(),
      user_id: user.id,
      mode: 'countdown',
      planned_duration_s: 1500,
      actual_focus_s: 1500,
      started_at: new Date(ended - 1_500_000).toISOString(),
      ended_at: new Date(ended).toISOString(),
      outcome: 'completed',
      seed: `e2e-${newId()}`,
      device: 'e2e',
      client_created_at: new Date(ended).toISOString(),
      shared_id: sharedId,
    });
  expect(error).toBeNull();
};

/** Runs one 25-minute session to completion on a page whose clock is in the past. */
const completeSession = async (page: Page) => {
  await page.getByRole('button', { name: 'Start 25 min' }).click();
  await expect(page.getByRole('timer')).toBeVisible();
  await page.clock.fastForward('25:01');
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();
};

const skyCaption = (page: Page, text: string | RegExp) =>
  page.locator('svg[aria-label="Your sky"] text').filter({ hasText: text });

const sharedRows = async (user: TestUser) => {
  const { data } = await adminClient()
    .from('ledger')
    .select('delta')
    .eq('user_id', user.id)
    .eq('reason', 'shared');
  return data ?? [];
};

test('propose, accept, and a session goes only where it was aimed (S2.2, S3.3, S4.1, S1.2)', async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const [ada, bea] = await people('Ada', 'Bea');
  await befriend(ada!, bea!);
  const a = await openDevice(browser, BASE, ada!, { clockMinutesAgo: 120 });
  const b = await openDevice(browser, BASE, bea!, { clockMinutesAgo: 120 });

  try {
    // S2.2: Ada proposes the Kite from Bea's page, with the usual picker.
    await openFriends(a.page);
    await a.page.getByRole('button', { name: /^Bea/ }).click();
    await a.page.getByRole('button', { name: 'Start a shared constellation' }).click();
    const picker = a.page.getByRole('dialog', { name: 'Choose one to build together' });
    await picker.getByRole('button', { name: /^The Kite/ }).click();
    await expect(a.page.getByText('You proposed The Kite. Waiting for Bea.')).toBeVisible();

    // Bea sees it under Requests and accepts.
    await openFriends(b.page);
    await expect(b.page.getByText('Ada wants to build The Kite with you')).toBeVisible({
      timeout: 20_000,
    });
    await b.page.getByRole('button', { name: 'Accept The Kite with Ada' }).click();
    await expect(b.page.getByText('Ada wants to build The Kite with you')).toBeHidden();
    await backdateAcceptance({ a: ada!.id });

    // Ada's own constellation: the Arrow, with one star.
    await a.page.reload();
    await expectSignedIn(a.page);
    await a.page.getByRole('button', { name: 'Choose a constellation' }).click();
    await a.page
      .getByRole('dialog')
      .getByRole('button', { name: /^The Arrow/ })
      .click();
    await completeSession(a.page);
    await expect(a.page.getByRole('button', { name: /^Building The Arrow · 1 of / })).toBeVisible();

    // S3.3: a session aimed at the Kite leaves the Arrow at 1.
    const target = a.page.getByLabel('Working on');
    await expect(target).toBeVisible({ timeout: 20_000 });
    await target.selectOption({ label: 'The Kite with Bea' });
    await expect(a.page.getByText('Adds star 1 of 4 to The Kite with Bea')).toBeVisible();
    await completeSession(a.page);
    await expect(a.page.getByRole('button', { name: /^Building The Arrow · 1 of / })).toBeVisible();

    await openView(a.page, 'View sky');
    await expect(skyCaption(a.page, 'The Kite · with Bea · 1/4')).toBeVisible();
    await expect(skyCaption(a.page, /^The Arrow · 1\//)).toBeVisible();
    await backToTimer(a.page);

    // The server has it as Ada's session for the Kite.
    const { data: rows } = await adminClient()
      .from('shared_constellations')
      .select('id')
      .eq('a', ada!.id);
    const kiteId = (rows as { id: string }[])[0]!.id;
    await expect.poll(() => serverSessionsFor(ada!, kiteId), { timeout: 30_000 }).toBe(1);

    // S4.1: Bea's sky shows the same constellation with Ada's star.
    await b.page.reload();
    await expectSignedIn(b.page);
    await openView(b.page, 'View sky');
    await expect(skyCaption(b.page, 'The Kite · with Ada · 1/4')).toBeVisible({ timeout: 20_000 });
    await backToTimer(b.page);

    // S1.2: none of Ada's sessions are in Bea's own store.
    expect(await sessionsOnDevice(b.page)).toBe(0);
  } finally {
    await closeDevices(a, b);
  }
});

test('finishing it pays each of them the tier bonus once (S5.2)', async ({ browser }) => {
  test.setTimeout(150_000);
  const [ada, bea] = await people('Ada', 'Bea');
  await befriend(ada!, bea!);
  const id = await sharedKite(ada!, bea!);
  for (const ago of [170, 160, 150]) await addSharedSession(ada!, id, ago);

  const a = await openDevice(browser, BASE, ada!);
  const b = await openDevice(browser, BASE, bea!, { clockMinutesAgo: 120 });

  try {
    // Bea's session is the fourth star.
    const target = b.page.getByLabel('Working on');
    await expect(target).toBeVisible({ timeout: 20_000 });
    await target.selectOption({ label: 'The Kite with Ada' });
    await expect(b.page.getByText('Adds star 4 of 4 to The Kite with Ada')).toBeVisible();
    await completeSession(b.page);

    // Bea's device pays once the server has her last star; it asks again on its own.
    await expect.poll(() => serverSessionsFor(bea!, id), { timeout: 30_000 }).toBe(1);
    await expect.poll(() => sharedRows(bea!), { timeout: 60_000 }).toEqual([{ delta: 25 }]);

    // Ada's device would see it on its next look (every two minutes); a reload looks now.
    await a.page.reload();
    await expectSignedIn(a.page);
    await expect.poll(() => sharedRows(ada!), { timeout: 60_000 }).toEqual([{ delta: 25 }]);

    // Reloading pays nothing more.
    for (const page of [a.page, b.page]) {
      await page.reload();
      await expectSignedIn(page);
    }
    await a.page.waitForTimeout(3_000);
    for (const user of [ada!, bea!]) expect(await sharedRows(user)).toEqual([{ delta: 25 }]);

    // Finished, so the timer no longer offers it.
    await expect(b.page.getByLabel('Working on')).toBeHidden();
  } finally {
    await closeDevices(a, b);
  }
});

test('unfriending freezes it in both skies; offline it simply isn’t drawn (S6.2, S8.2)', async ({
  browser,
}) => {
  const [ada, bea] = await people('Ada', 'Bea');
  await befriend(ada!, bea!);
  const id = await sharedKite(ada!, bea!);
  await addSharedSession(bea!, id, 100);

  const a = await openDevice(browser, BASE, ada!);
  try {
    await expect(a.page.getByLabel('Working on')).toBeVisible({ timeout: 20_000 });

    await unfriend(bea!);
    await a.page.reload();
    await expectSignedIn(a.page);
    await openView(a.page, 'View sky');
    await expect(skyCaption(a.page, 'The Kite · with Bea · stopped')).toBeVisible({
      timeout: 20_000,
    });
    await backToTimer(a.page);
    await expect(a.page.getByLabel('Working on')).toBeHidden();

    // S8.2: with the server unreachable it is just absent; no error, the timer works.
    await a.page.route('**/rest/v1/rpc/my_shared', (route) => route.abort());
    await a.page.reload();
    await expectSignedIn(a.page);
    await openView(a.page, 'View sky');
    await expect(skyCaption(a.page, /with Bea/)).toHaveCount(0);
    await expect(a.page.getByRole('alert')).toHaveCount(0);
    await backToTimer(a.page);
    await expect(a.page.getByRole('button', { name: 'Start 25 min' })).toBeVisible();
  } finally {
    await closeDevices(a);
  }
});
