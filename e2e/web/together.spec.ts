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

/** The newest room this person hosts. */
const roomOf = async (host: TestUser): Promise<string> => {
  const { data } = await adminClient()
    .from('together_rooms')
    .select('id')
    .eq('host', host.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  return (data as { id: string }).id;
};

const memberState = async (roomId: string, user: TestUser) => {
  const { data } = await adminClient()
    .from('together_members')
    .select('state')
    .eq('room_id', roomId)
    .eq('user_id', user.id)
    .single();
  return (data as { state: string }).state;
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
    // The panel closes: the lobby is on the timer screen, in place of a solo
    // Start (A2), and has the focus.
    const adaLobby = a.page.getByRole('heading', { name: '25 min together' });
    await expect(adaLobby).toBeVisible();
    await expect(adaLobby).toBeFocused();
    await expect(a.page.getByRole('button', { name: 'Back to timer' })).toBeHidden();
    await expect(a.page.getByRole('button', { name: /^Start \d+ min$/ })).toBeHidden();
    await expect(a.page.getByRole('button', { name: 'Start together' })).toBeDisabled();

    // 3.1: Bea's banner arrives live, without a reload.
    const banner = b.page.getByRole('region', { name: 'Invitation' });
    await expect(banner).toContainText('Ada invites you to focus 25 min together.', {
      timeout: 10_000,
    });
    await banner.getByRole('button', { name: 'Join' }).click();
    await expect(banner).toBeHidden();
    // A1: once joined, Bea waits in the lobby and can't start on her own.
    await expect(b.page.getByRole('heading', { name: '25 min together' })).toBeVisible();
    await expect(b.page.getByText('Waiting for Ada to start.')).toBeVisible();
    await expect(b.page.getByRole('button', { name: /^Start/ })).toBeHidden();

    // Ada's lobby shows Bea in; Start opens.
    const start = a.page.getByRole('button', { name: 'Start together' });
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

test('starting alone while invited asks first, and declines only on yes (A4, A5)', async ({
  browser,
}) => {
  const [ada, bea] = await people('Ada', 'Bea');
  await befriend(ada!, bea!);
  const a = await openDevice(browser, BASE, ada!);
  const b = await openDevice(browser, BASE, bea!);

  try {
    await a.page.getByRole('button', { name: 'Focus with friends' }).click();
    await a.page.getByRole('checkbox', { name: 'Bea' }).check();
    await a.page.getByRole('button', { name: 'Invite' }).click();
    const banner = b.page.getByRole('region', { name: 'Invitation' });
    await expect(banner).toBeVisible({ timeout: 10_000 });
    const room = await roomOf(ada!);

    // A5: Bea presses Start, then thinks better of it.
    const start = b.page.getByRole('button', { name: 'Start 25 min' });
    await start.click();
    const dialog = b.page.getByRole('alertdialog', { name: 'Start on your own?' });
    await expect(dialog).toContainText('Ada invited you to focus together.');
    await expect(dialog.getByRole('button', { name: 'Not now' })).toBeFocused();
    await b.page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(start).toBeFocused();
    await expect(banner).toBeVisible();
    await expect(endsAtLine(b.page)).toBeHidden();
    expect(await memberState(room, bea!)).toBe('invited');

    // A4: this time she starts on her own; that says no to Ada.
    await start.click();
    await dialog.getByRole('button', { name: 'Start on my own' }).click();
    await expect(endsAtLine(b.page)).toBeVisible({ timeout: 10_000 });
    await expect(banner).toBeHidden();
    expect(await memberState(room, bea!)).toBe('declined');
    await expect(a.page.getByText('Said no')).toBeVisible({ timeout: 10_000 });
  } finally {
    await closeDevices(a, b);
  }
});

test('a room that starts while another of your devices runs a session says so there (A6)', async ({
  browser,
}) => {
  const [ada, bea] = await people('Ada', 'Bea');
  await befriend(ada!, bea!);
  const b1 = await openDevice(browser, BASE, bea!);
  const b2 = await openDevice(browser, BASE, bea!);

  try {
    // Bea's second device is already focusing on its own.
    await b2.page.getByRole('button', { name: 'Start 25 min' }).click();
    await expect(endsAtLine(b2.page)).toBeVisible();
    const soloEnds = await endsAtLine(b2.page).innerText();

    const room = await createRoom(ada!, [bea!], 1500);
    await rpc(bea!, 'respond_room', { room, join_room: true });
    await rpc(ada!, 'start_room', { room });

    // The first device runs the room; the second keeps its own session and says so.
    await expect(endsAtLine(b1.page)).toBeVisible({ timeout: 15_000 });
    await expect(b1.page.getByText('Focusing together with Ada')).toBeVisible();
    await expect(
      b2.page.getByText('Your friends session with Ada started while this one was running.'),
    ).toBeVisible({ timeout: 20_000 });
    expect(await endsAtLine(b2.page).innerText()).toBe(soloEnds);
  } finally {
    await closeDevices(b1, b2);
  }
});

/** The lobby's member list, and one member's entry in it. */
const lobbyList = (page: Page) => page.getByRole('list', { name: 'Who’s coming' });
const lobbyMember = (page: Page, name: string) =>
  lobbyList(page)
    .getByRole('listitem')
    .filter({ has: page.getByText(name, { exact: true }) });

/** Whether the page scrolls at its current size. */
const scrolls = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight);

test('the lobby shows who’s in, who’s invited and how long it waits; it fits small windows (B1, B2, B4, B7, B9)', async ({
  browser,
}, testInfo) => {
  const [ada, bea, cy, dee] = await people('Ada', 'Bea', 'Cy', 'Dee');
  await Promise.all([befriend(ada!, bea!), befriend(ada!, cy!), befriend(ada!, dee!)]);
  const a = await openDevice(browser, BASE, ada!);
  const b = await openDevice(browser, BASE, bea!);

  try {
    // B7: Ada's device asks for less motion.
    await a.page.emulateMedia({ reducedMotion: 'reduce' });
    await a.page.getByRole('button', { name: 'Focus with friends' }).click();
    for (const name of ['Bea', 'Cy', 'Dee']) {
      await a.page.getByRole('checkbox', { name }).check();
    }
    await a.page.getByRole('button', { name: 'Invite' }).click();

    // B1: four stars, Ada's own marked as host, the rest invited, and the clock on the invite.
    await expect(lobbyList(a.page).getByRole('listitem')).toHaveCount(4);
    await expect(lobbyMember(a.page, 'You')).toContainText('Host');
    for (const name of ['Bea', 'Cy', 'Dee']) {
      await expect(lobbyMember(a.page, name)).toContainText('Invited');
    }
    await expect(a.page.getByText(/^Invite open for 10 more min\./)).toBeVisible();
    await expect(a.page.getByText('Start opens once a friend has joined.')).toBeVisible();
    // An invited star twinkles, except under reduced motion.
    const invitedStar = lobbyMember(a.page, 'Bea').getByTestId('member-star');
    expect(await invitedStar.evaluate((el) => getComputedStyle(el).animationName)).toBe(
      'sky-twinkle',
    );
    const duration = await invitedStar.evaluate((el) => getComputedStyle(el).animationDuration);
    expect(parseFloat(duration)).toBeLessThan(0.001);

    // B2: Bea joins; Ada sees her star come in, and Bea sees the same lobby.
    await b.page
      .getByRole('region', { name: 'Invitation' })
      .getByRole('button', { name: 'Join' })
      .click({ timeout: 10_000 });
    await expect(lobbyMember(a.page, 'Bea')).toContainText('In', { timeout: 5_000 });
    await expect(a.page.getByText('Everyone who’s in is ready. Start when you are.')).toBeVisible();
    await expect(lobbyMember(b.page, 'Ada')).toContainText('Host');
    await expect(lobbyMember(b.page, 'You')).toContainText('In');
    await expect(b.page.getByText('Waiting for Ada to start.')).toBeVisible();

    // B9: the lobby fits the desktop window and a narrow window. (At 375×667
    // the idle timer screen itself already scrolls, so that size isn't the bar.)
    for (const [width, height] of [
      [480, 720],
      [375, 812],
    ] as const) {
      await a.page.setViewportSize({ width, height });
      await b.page.setViewportSize({ width, height });
      expect(await scrolls(a.page), `host lobby scrolls at ${width}×${height}`).toBe(false);
      expect(await scrolls(b.page), `guest lobby scrolls at ${width}×${height}`).toBe(false);
    }
    await a.page.setViewportSize({ width: 480, height: 720 });
    await b.page.setViewportSize({ width: 480, height: 720 });
    await a.page.screenshot({ path: testInfo.outputPath('lobby-host.png') });
    await b.page.screenshot({ path: testInfo.outputPath('lobby-guest.png') });

    // B4: started, each sees the other under the clock.
    await a.page.getByRole('button', { name: 'Start together' }).click();
    await expect(a.page.getByText('Focusing together with Bea')).toBeVisible({ timeout: 10_000 });
    await expect(b.page.getByText('Focusing together with Ada')).toBeVisible({ timeout: 10_000 });
    await b.page.screenshot({ path: testInfo.outputPath('running-together.png') });
  } finally {
    await closeDevices(a, b);
  }
});

test('a lobby that ends without starting says so gently, then the timer is back (B5, B6)', async ({
  browser,
}) => {
  const [ada, bea] = await people('Ada', 'Bea');
  await befriend(ada!, bea!);
  const b = await openDevice(browser, BASE, bea!);

  try {
    const note = b.page.getByRole('region', { name: 'Friends session' });

    // B6: a lobby nobody started runs out. (First: backdating it makes it the
    // older room, which a newer one would then speak over.)
    const lapsing = await createRoom(ada!, [bea!], 1500);
    await rpc(bea!, 'respond_room', { room: lapsing, join_room: true });
    await expect(b.page.getByText('Waiting for Ada to start.')).toBeVisible({ timeout: 15_000 });
    const { error } = await adminClient()
      .from('together_rooms')
      .update({ created_at: new Date(Date.now() - 11 * 60_000).toISOString() })
      .eq('id', lapsing);
    expect(error).toBeNull();
    await b.page.reload();
    await expectSignedIn(b.page);
    await expect(note).toContainText('The invite ran out before it started.', {
      timeout: 10_000,
    });
    await expect(b.page.getByRole('button', { name: 'Start 25 min' })).toBeVisible();
    await note.getByRole('button', { name: 'OK' }).click();
    await expect(note).toBeHidden();

    // B5: Ada closes the lobby Bea is waiting in.
    const closed = await createRoom(ada!, [bea!], 1500);
    await rpc(bea!, 'respond_room', { room: closed, join_room: true });
    await expect(b.page.getByText('Waiting for Ada to start.')).toBeVisible({ timeout: 15_000 });
    await rpc(ada!, 'leave_room', { room: closed });
    await expect(note).toContainText('Ada closed the lobby. Maybe next time.', {
      timeout: 10_000,
    });
    await expect(b.page.getByRole('button', { name: 'Start 25 min' })).toBeVisible();
    await note.getByRole('button', { name: 'OK' }).click();
    await expect(note).toBeHidden();
  } finally {
    await closeDevices(b);
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
