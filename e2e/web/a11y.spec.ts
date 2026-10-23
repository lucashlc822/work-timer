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
import { addCompletedSession, befriend, requestFriend, setName } from '../support/friends';
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
  await settleTransitions(page);
  findings.push(...(await scan(page, 'account')));
  await backToTimer(page);

  // Friends (M7): a friend with a session, and a request waiting.
  const friend = await createUser('a11y-friend');
  const asker = await createUser('a11y-asker');
  await setName(user, 'Ada');
  await setName(friend, 'Bea');
  await setName(asker, 'Cy');
  await befriend(user, friend);
  await requestFriend(asker, user);
  await addCompletedSession(friend, 25);
  await page.reload();
  await expectSignedIn(page);
  await openFriends(page);
  await page.getByText('Cy wants to be friends').waitFor();
  await settleTransitions(page);
  findings.push(...(await scan(page, 'friends')));

  await page.getByRole('button', { name: /^Bea/ }).click();
  await page.getByRole('definition').first().waitFor();
  await settleTransitions(page);
  findings.push(...(await scan(page, "a friend's sky")));

  await report(testInfo, findings);
});
