import { expect, test, type Page } from '@playwright/test';

import { expectSignedIn, signIn } from '../support/app';
import { closeDevices, openDevice } from '../support/devices';
import { befriend, createRoom, rpc, setName } from '../support/friends';
import { adminClient, createUser, signedInClient, type TestUser } from '../support/users';

/**
 * Focus together (M7 phase 4), on two or three browser contexts that are
 * different people. Clocks run at real time here: a room's start and end are
 * the server's, and a fast-forwarded page would end its session in the
 * server's future, which the server refuses. One-minute rooms are made
 * through the API where the test needs a real ending.
 */

const BASE = 'http://127.0.0.1:4174';

const people = async (...names: string[]): Promise<TestUser[]> => {
  const users = await Promise.all(names.map((n) => createUser(`tg-${n.toLowerCase()}`)));
  await Promise.all(users.map((u, i) => setName(u, names[i]!)));
  return users;
};

const endsAtLine = (page: Page) => page.getByText(/ · ends at /);

const endEarly = async (page: Page) => {
  await page.getByRole('button', { name: 'End early' }).click();
  await page.getByRole('button', { name: 'End session' }).click();
};

const serverSession = async (user: TestUser, roomId: string) => {
  const { data } = await adminClient()
    .from('sessions')
    .select('outcome, ended_at, actual_focus_s')
    .eq('user_id', user.id)
    .eq('together_id', roomId);
  return (data ?? [])[0] as
    { outcome: string; ended_at: string; actual_focus_s: number } | undefined;
};

const roomRow = async (roomId: string) => {
  const { data } = await adminClient()
    .from('together_rooms')
    .select('status, cancelled_at, ends_at')
    .eq('id', roomId)
    .single();
  return data as { status: string; cancelled_at: string | null; ends_at: string };
};

test('invite, join and start together; a friend’s end-early ends it for everyone (3.1, 3.3)', async ({
  browser,
}) => {
  const [ada, bea] = await people('Ada', 'Bea');
  await befriend(ada!, bea!);
  const a = await openDevice(browser, BASE, ada!);
  const b = await openDevice(browser, BASE, bea!);

  try {
    // Ada invites Bea from the timer.
    await a.page.getByRole('button', { name: 'Focus with friends' }).click();
    await a.page.getByRole('checkbox', { name: 'Bea' }).check();
    await a.page
      .getByRole('group', { name: 'How long' })
      .getByRole('radio', { name: '25 min' })
      .check();
    await a.page.getByRole('button', { name: 'Invite' }).click();
    await expect(a.page.getByRole('heading', { name: '25 min together' })).toBeVisible();

    // 3.1: Bea's banner arrives live, without a reload.
    const banner = b.page.getByRole('region', { name: 'Invitation' });
    await expect(banner).toContainText('Ada invites you to focus 25 min together.', {
      timeout: 10_000,
    });
    await banner.getByRole('button', { name: 'Join' }).click();
    await expect(banner).toBeHidden();

    // Ada's lobby shows Bea in; Start opens.
    const start = a.page.getByRole('button', { name: 'Start', exact: true });
    await expect(start).toBeEnabled({ timeout: 10_000 });
    await start.click();

    // Both timers run to the same end, with no click on Bea's side.
    await expect(endsAtLine(a.page)).toBeVisible({ timeout: 10_000 });
    await expect(endsAtLine(b.page)).toBeVisible({ timeout: 10_000 });
    expect(await endsAtLine(b.page).innerText()).toBe(await endsAtLine(a.page).innerText());
    await expect(a.page.getByText('Focusing together with Bea')).toBeVisible();
    await expect(b.page.getByText('Focusing together with Ada')).toBeVisible();

    // 3.3: Bea ends early; the dialog warns first.
    await b.page.getByRole('button', { name: 'End early' }).click();
    await expect(b.page.getByRole('alertdialog')).toContainText(
      'This ends the session for Ada too.',
    );
    await b.page.getByRole('button', { name: 'End session' }).click();
    await expect(b.page.getByText('You ended it for everyone.')).toBeVisible();

    // Ada's session ends on its own, saying who.
    await expect(a.page.getByRole('heading', { name: 'Session ended early' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(a.page.getByText('Bea ended the session for everyone.')).toBeVisible();
  } finally {
    await closeDevices(a, b);
  }
});

test('finishing together earns a star each and +10 Stardust once (3.2, 3.5)', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const [ada, bea] = await people('Ada', 'Bea');
  await befriend(ada!, bea!);
  const a = await openDevice(browser, BASE, ada!);
  const b = await openDevice(browser, BASE, bea!);

  try {
    const room = await createRoom(ada!, [bea!], 60);
    await rpc(bea!, 'respond_room', { room, join_room: true });
    await rpc(ada!, 'start_room', { room });

    await expect(endsAtLine(a.page)).toBeVisible({ timeout: 15_000 });
    await expect(endsAtLine(b.page)).toBeVisible({ timeout: 15_000 });

    // 3.5: Ada's window is hidden for the rest of the session.
    await a.page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    for (const page of [a.page, b.page]) {
      await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible({
        timeout: 90_000,
      });
    }
    await expect(b.page.getByText(/Focused together with Ada\./)).toBeVisible();

    // Both sessions reach the server; then each device asks for its wins.
    for (const user of [ada!, bea!]) {
      await expect
        .poll(async () => (await serverSession(user, room))?.outcome, { timeout: 30_000 })
        .toBe('completed');
    }
    for (const page of [a.page, b.page]) {
      await page.reload();
      await expectSignedIn(page);
    }

    const bonusRows = async (user: TestUser) => {
      const { data } = await adminClient()
        .from('ledger')
        .select('delta')
        .eq('user_id', user.id)
        .eq('reason', 'together');
      return (data ?? []) as { delta: number }[];
    };
    for (const user of [ada!, bea!]) {
      await expect.poll(() => bonusRows(user), { timeout: 30_000 }).toEqual([{ delta: 10 }]);
    }
    // Reconciling again never pays twice.
    await a.page.reload();
    await expectSignedIn(a.page);
    await a.page.waitForTimeout(3_000);
    expect(await bonusRows(ada!)).toEqual([{ delta: 10 }]);
  } finally {
    await closeDevices(a, b);
  }
});

test('a device offline when a friend cancels ends its session at that moment (3.4)', async ({
  browser,
}) => {
  const [ada, bea] = await people('Ada', 'Bea');
  await befriend(ada!, bea!);
  const a = await openDevice(browser, BASE, ada!);
  const b = await openDevice(browser, BASE, bea!);

  try {
    const room = await createRoom(ada!, [bea!], 1500);
    await rpc(bea!, 'respond_room', { room, join_room: true });
    await rpc(ada!, 'start_room', { room });
    await expect(endsAtLine(a.page)).toBeVisible({ timeout: 15_000 });
    await expect(endsAtLine(b.page)).toBeVisible({ timeout: 15_000 });

    // Cut Ada off for real. Her live channel is routed to nothing (after a
    // reload, so the socket already open goes), then every request fails.
    // Playwright's offline switch alone leaves an open WebSocket working.
    await a.page.routeWebSocket(/\/realtime\//, () => {});
    await a.page.reload();
    await expect(endsAtLine(a.page)).toBeVisible({ timeout: 15_000 });
    await a.context.setOffline(true);
    await endEarly(b.page);
    await expect
      .poll(async () => (await roomRow(room)).status, { timeout: 10_000 })
      .toBe('cancelled');
    // Offline, Ada's session can't know yet.
    await a.page.waitForTimeout(3_000);
    await expect(endsAtLine(a.page)).toBeVisible();

    await a.context.setOffline(false);
    await expect(a.page.getByText('Bea ended the session for everyone.')).toBeVisible({
      timeout: 20_000,
    });

    const cancelledAt = Date.parse((await roomRow(room)).cancelled_at!);
    await expect
      .poll(async () => (await serverSession(ada!, room))?.outcome, { timeout: 30_000 })
      .toBe('cancelled');
    const ended = Date.parse((await serverSession(ada!, room))!.ended_at);
    expect(Math.abs(ended - cancelledAt)).toBeLessThan(2_000);
  } finally {
    await closeDevices(a, b);
  }
});

test('an invitation lapses after ten minutes, and nobody joins after the start (3.6, 3.7)', async ({
  browser,
}) => {
  const [ada, bea, cy] = await people('Ada', 'Bea', 'Cy');
  await befriend(ada!, bea!);
  await befriend(ada!, cy!);
  const b = await openDevice(browser, BASE, bea!);
  const c = await openDevice(browser, BASE, cy!);

  try {
    // 3.6: an invitation nobody answers lapses.
    const lapsing = await createRoom(ada!, [bea!], 1500);
    const banner = b.page.getByRole('region', { name: 'Invitation' });
    await expect(banner).toBeVisible({ timeout: 10_000 });
    const { error } = await adminClient()
      .from('together_rooms')
      .update({ created_at: new Date(Date.now() - 11 * 60_000).toISOString() })
      .eq('id', lapsing);
    expect(error).toBeNull();
    await b.page.reload();
    await expectSignedIn(b.page);
    await b.page.waitForTimeout(2_000);
    await expect(banner).toBeHidden();
    const late = await (
      await signedInClient(bea!)
    ).rpc('respond_room', {
      room: lapsing,
      join_room: true,
    });
    expect(late.error?.message).toBe('room_closed');

    // 3.7: Cy is invited but doesn't join; Ada starts with Bea.
    const room = await createRoom(ada!, [bea!, cy!], 1500);
    const cyBanner = c.page.getByRole('region', { name: 'Invitation' });
    await expect(cyBanner).toBeVisible({ timeout: 10_000 });
    await rpc(bea!, 'respond_room', { room, join_room: true });
    await rpc(ada!, 'start_room', { room });

    await expect(cyBanner).toBeHidden({ timeout: 10_000 });
    const after = await (
      await signedInClient(cy!)
    ).rpc('respond_room', {
      room,
      join_room: true,
    });
    expect(after.error?.message).toBe('room_not_found');
    await expect(endsAtLine(c.page)).toBeHidden();
  } finally {
    await closeDevices(b, c);
  }
});

test('a signed-in person with no friends sees no "Focus with friends"', async ({ page }) => {
  const [loner] = await people('Lone');
  await page.goto(BASE);
  await signIn(page, loner!);
  await expectSignedIn(page);
  await expect(page.getByRole('button', { name: 'Start 25 min' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Focus with friends' })).toBeHidden();
});
