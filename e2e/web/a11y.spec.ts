import { test } from '@playwright/test';

import {
  backToTimer,
  expectSignedIn,
  openFriends,
  openTagPicker,
  openView,
  signIn,
} from '../support/app';
import { report, scan, settleTransitions, type Finding } from '../support/a11y';
import { startClockInThePast } from '../support/clock';
import {
  addCompletedSession,
  befriend,
  requestFriend,
  rpc,
  setName,
  shareFocus,
} from '../support/friends';
import { createUser } from '../support/users';

/**
 * Accessibility, screen by screen (axe-core, see support/a11y.ts). The signed-
 * out screens first, then every screen a signed-in person can reach.
 */

test('the signed-out screens', async ({ page }, testInfo) => {
  const findings: Finding[] = [];
  await page.goto('/');

  await page.getByRole('heading', { name: 'Sign in' }).waitFor();
  findings.push(...(await scan(page, 'sign in')));

  await page.getByRole('button', { name: 'New here? Create an account' }).click();
  await page.getByRole('heading', { name: 'Create your account' }).waitFor();
  findings.push(...(await scan(page, 'sign up')));

  await page.getByRole('button', { name: 'Already have an account? Sign in' }).click();
  await page.getByRole('button', { name: 'Forgot your password?' }).click();
  await page.getByRole('heading', { name: 'Reset your password' }).waitFor();
  findings.push(...(await scan(page, 'forgot password')));

  await report(testInfo, findings);
});

test('the signed-in screens', async ({ page }, testInfo) => {
  // One long walk through every screen, with several waits on the friends
  // poll (~15 s each): about 55 s locally, more on CI.
  test.setTimeout(180_000);
  const user = await createUser('a11y');
  const findings: Finding[] = [];
  await startClockInThePast(page);
  await page.goto('/');
  await signIn(page, user);
  await expectSignedIn(page);
  await settleTransitions(page);

  findings.push(...(await scan(page, 'timer, idle')));

  await openTagPicker(page);
  findings.push(...(await scan(page, 'timer, tag picker open')));
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Choose a constellation' }).click();
  await settleTransitions(page);
  findings.push(...(await scan(page, 'constellation picker')));
  await page.keyboard.press('Escape');

  await page.getByRole('radio', { name: 'Pomodoro' }).click();
  await settleTransitions(page);
  findings.push(...(await scan(page, 'timer, Pomodoro settings')));
  await page.getByRole('radio', { name: 'Countdown' }).click();

  await page.getByRole('button', { name: 'Start 25 min' }).click();
  await page.getByRole('timer').waitFor();
  await settleTransitions(page);
  findings.push(...(await scan(page, 'timer, running')));

  await page.getByRole('button', { name: 'End early' }).click();
  await page.getByRole('alertdialog').waitFor();
  findings.push(...(await scan(page, 'end-early dialog')));
  await page.getByRole('button', { name: 'Keep going' }).click();

  await page.clock.fastForward('25:01');
  await page.getByRole('heading', { name: 'Session complete' }).waitFor();
  await settleTransitions(page);
  findings.push(...(await scan(page, 'session result')));
  await page.getByRole('button', { name: 'Done' }).click();

  await openView(page, 'View sky');
  await settleTransitions(page);
  findings.push(...(await scan(page, 'sky')));
  // A star's card (View sky upgrade PR 3), opened from the keyboard.
  await page
    .getByRole('img', { name: /star from/i })
    .first()
    .focus();
  await page.getByTestId('star-card').waitFor();
  findings.push(...(await scan(page, 'sky with a star card')));
  await page.keyboard.press('Escape');
  await backToTimer(page);

  await openView(page, 'Stats');
  await settleTransitions(page);
  findings.push(...(await scan(page, 'stats')));
  await backToTimer(page);

  await page.getByRole('button', { name: /Stardust$/ }).click();
  await page.getByRole('region', { name: 'Shop' }).waitFor();
  await settleTransitions(page);
  findings.push(...(await scan(page, 'Stardust and shop')));
  await backToTimer(page);

  await openView(page, 'Account');
  // "Show when I'm online" (M7 presence) appears once the profile has loaded.
  await page.getByRole('checkbox', { name: 'Show when I’m online' }).waitFor();
  await settleTransitions(page);
  findings.push(...(await scan(page, 'account')));
  await backToTimer(page);

  // Friends (M7): a friend with a session, one online and one away (presence),
  // and a request waiting.
  const friend = await createUser('a11y-friend');
  const asker = await createUser('a11y-asker');
  const online = await createUser('a11y-online');
  const stepped = await createUser('a11y-away');
  await setName(user, 'Ada');
  await setName(friend, 'Bea');
  await setName(asker, 'Cy');
  await setName(online, 'Dee');
  await setName(stepped, 'Eve');
  await befriend(user, friend);
  await befriend(user, online);
  await befriend(user, stepped);
  await requestFriend(asker, user);
  await addCompletedSession(friend, 25);
  await shareFocus(friend, 20);
  await rpc(online, 'set_presence', { state: 'online' });
  await rpc(stepped, 'set_presence', { state: 'away' });
  await page.reload();
  await expectSignedIn(page);
  await openFriends(page);
  await page.getByText('Cy wants to be friends').waitFor();
  await page.getByText(/Focusing now/).waitFor();
  await page.getByText('Online', { exact: true }).waitFor();
  await page.getByText('Away', { exact: true }).waitFor();
  await settleTransitions(page);
  findings.push(...(await scan(page, 'friends')));

  await page.getByRole('button', { name: /^Bea/ }).click();
  await page.getByRole('definition').first().waitFor();
  await settleTransitions(page);
  findings.push(...(await scan(page, "a friend's sky")));

  // Shared constellations (M7 phase 5): a proposal, the friend's page while
  // building one, the timer's "Working on", and the sky with it drawn.
  await rpc(friend, 'propose_shared', {
    friend: user.id,
    source: 'catalogue',
    shape_id: 'kite',
    seed: null,
    tier: 'easy',
    stars_needed: 4,
    min_focus_s: 0,
  });
  await page.keyboard.press('Escape'); // a friend's sky -> friends
  await page.getByText('Bea wants to build The Kite with you').waitFor({ timeout: 20_000 });
  await settleTransitions(page);
  findings.push(...(await scan(page, 'shared constellation proposal')));
  await page.getByRole('button', { name: 'Accept The Kite with Bea' }).click();
  await page.getByRole('button', { name: /^Bea/ }).click();
  await page.getByText('Building The Kite together · 0 of 4').waitFor({ timeout: 20_000 });
  await settleTransitions(page);
  findings.push(...(await scan(page, "a friend's sky, building together")));
  await page.keyboard.press('Escape'); // a friend's sky -> friends
  await page.keyboard.press('Escape'); // friends -> timer
  await page.getByLabel('Working on').waitFor();
  await settleTransitions(page);
  findings.push(...(await scan(page, 'timer, working on')));
  await openView(page, 'View sky');
  await page.getByText('The Kite · with Bea · 0/4').waitFor();
  await settleTransitions(page);
  findings.push(...(await scan(page, 'sky with a shared constellation')));
  await backToTimer(page);

  // Focus together (M7 phase 4): the panel, an invitation, and a lobby.
  await page.getByRole('button', { name: 'Focus with friends' }).click();
  await page.getByRole('heading', { name: 'Focus together' }).waitFor();
  await settleTransitions(page);
  findings.push(...(await scan(page, 'focus together')));
  await page.keyboard.press('Escape');

  const firstRoom = (await rpc(friend, 'create_room', {
    friends: [user.id],
    planned_duration_s: 1500,
  })) as string;
  const banner = page.getByRole('region', { name: 'Invitation' });
  await banner.waitFor({ timeout: 15_000 });
  await settleTransitions(page);
  findings.push(...(await scan(page, 'invitation banner')));
  // Start while invited asks first.
  await page.getByRole('button', { name: /^Start \d+ min$/ }).click();
  await page.getByRole('alertdialog', { name: 'Start on your own?' }).waitFor();
  await settleTransitions(page);
  findings.push(...(await scan(page, 'start on your own dialog')));
  await page.keyboard.press('Escape');
  // Joined, the lobby takes the place of Start on the timer screen.
  await banner.getByRole('button', { name: 'Join' }).click();
  await page.getByRole('heading', { name: '25 min together' }).waitFor();
  await settleTransitions(page);
  findings.push(...(await scan(page, 'together lobby')));

  // The host closes it: the gentle note over the timer.
  await rpc(friend, 'leave_room', { room: firstRoom });
  const ended = page.getByRole('region', { name: 'Friends session' });
  await ended.waitFor({ timeout: 15_000 });
  await settleTransitions(page);
  findings.push(...(await scan(page, 'lobby ended note')));
  await ended.getByRole('button', { name: 'OK' }).click();

  // Running together: the companions under the clock.
  const room = (await rpc(friend, 'create_room', {
    friends: [user.id],
    planned_duration_s: 1500,
  })) as string;
  await rpc(user, 'respond_room', { room, join_room: true });
  await rpc(friend, 'start_room', { room });
  await page.getByText(/^Focusing together with /).waitFor({ timeout: 15_000 });
  await settleTransitions(page);
  findings.push(...(await scan(page, 'running together')));

  await report(testInfo, findings);
});
