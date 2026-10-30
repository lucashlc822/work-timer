import { expect, test } from '@playwright/test';

import { expectSignedIn, openAccount, signIn, signOut } from '../support/app';
import { settle } from '../support/devices';
import { befriend, createRoom, setName } from '../support/friends';
import { adminClient, createUser } from '../support/users';
import { launchDesktop, type Desktop } from './launch';
import {
  launchAgain,
  nativeLog,
  rawEvaluate,
  rawInvoke,
  removeRunEntry,
  runEntries,
  type NativeLog,
} from './tauri';

/**
 * What only the desktop app does: the tray, the completion notification,
 * hiding to the tray without stopping a session, and autostart.
 *
 * Windows gives a test no way to read the tray tooltip or a toast back, so
 * those are checked through `debug_native_log`, a command that exists in debug
 * builds only and records what the app asked Windows to show. That proves the
 * app asked for the right thing at the right moment, not that Windows drew it:
 * docs/qa-desktop-checklist.md covers looking at it.
 */

test.describe.configure({ mode: 'serial' });

let desktop: Desktop;

test.beforeAll(async () => {
  test.setTimeout(600_000);
  desktop = await launchDesktop();
});

test.afterAll(async () => {
  await desktop?.stop();
});

test('a session keeps running hidden in the tray: tooltip counts down, the notice fires, the window comes back', async () => {
  test.setTimeout(240_000);
  const page = desktop.page;
  const user = await createUser('desktop-native');
  await signIn(page, user);
  await expectSignedIn(page);
  await settle(page);

  expect((await nativeLog(page)).notifications).toEqual([]);

  await page.getByRole('radio', { name: '1 min (dev)' }).click();
  await page.getByRole('button', { name: 'Start 1 min' }).click();
  await expect(page.getByRole('timer')).toBeVisible();
  await expect
    .poll(async () => (await nativeLog(page)).tooltip, { timeout: 15_000 })
    .toBe('Starkeep — 1 min left');

  // Close the window, as with its X: it hides to the tray instead of quitting,
  // and the page must know it can't be seen (the WebView2 visibility fix).
  // Playwright steps away for this part: while it is attached the page always
  // reports itself visible.
  await desktop.detach();
  const visible = () => rawEvaluate('document.visibilityState');
  const log = () => rawInvoke<NativeLog>('debug_native_log');
  await rawInvoke('plugin:window|close', { label: 'main' });
  await expect.poll(visible, { timeout: 10_000 }).toBe('hidden');

  // The deadline lives in Rust, so the notice fires on time with the window hidden.
  await expect
    .poll(async () => (await log()).notifications, { timeout: 100_000 })
    .toEqual([{ title: 'Starkeep', body: 'Session complete — 1 minute of focus.' }]);
  expect((await log()).tooltip).toBe('Starkeep');

  // Opening the app again brings the window back, and visible.
  launchAgain();
  await expect.poll(visible, { timeout: 15_000 }).toBe('visible');
  await desktop.attach();
  await expect(desktop.page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
  await desktop.page.getByRole('button', { name: 'Done' }).click();

  // And it is a real, completed session on the server.
  await expect
    .poll(
      async () =>
        (await adminClient().from('sessions').select('outcome').eq('user_id', user.id)).data,
      { timeout: 20_000 },
    )
    .toEqual([{ outcome: 'completed' }]);

  await signOut(desktop.page);
});

test('an invitation to focus together raises a Windows notification (M7)', async () => {
  test.setTimeout(120_000);
  const page = desktop.page;
  const bea = await createUser('desktop-invitee');
  const ada = await createUser('desktop-host');
  await setName(bea, 'Bea');
  await setName(ada, 'Ada');
  await befriend(ada, bea);
  await signIn(page, bea);
  await expectSignedIn(page);
  await settle(page);

  // The notification plugin shows a notification by constructing
  // `window.Notification` (its own polyfill, which hands it to Windows), and
  // `debug_native_log` only sees the ones Rust raises. So watch the page ask:
  // the same standard as the other checks here (asked for, not seen drawn).
  await page.evaluate(() => {
    const shown: { title: string; body: string | undefined }[] = [];
    (window as unknown as { __shown: typeof shown }).__shown = shown;
    const Original = window.Notification;
    window.Notification = new Proxy(Original, {
      construct(target, args: [string, NotificationOptions?]) {
        shown.push({ title: args[0], body: args[1]?.body });
        return Reflect.construct(target, args);
      },
    });
  });

  await createRoom(ada, [bea], 1500);
  await expect(page.getByRole('region', { name: 'Invitation' })).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __shown: unknown[] }).__shown), {
      timeout: 15_000,
    })
    .toEqual([{ title: 'Starkeep', body: 'Ada invites you to focus 25 min together.' }]);

  await signOut(page);
});

test('"Launch at startup" adds and removes the per-user startup entry', async () => {
  const before = runEntries();
  const existing = Object.entries(before).filter(([name, command]) =>
    /starkeep/i.test(`${name} ${command}`),
  );
  // Never touch a real setting: the installed app uses the same entry name.
  test.skip(
    existing.length > 0,
    `A Starkeep startup entry already exists (${existing.map(([n]) => n).join(', ')}); not touching it.`,
  );

  const page = desktop.page;
  const user = await createUser('desktop-autostart');
  await signIn(page, user);
  await expectSignedIn(page);

  // The switch lives in the Account panel, not on the timer screen.
  await expect(page.getByRole('checkbox', { name: 'Launch at startup' })).toHaveCount(0);
  await openAccount(page);
  const toggle = page.getByRole('checkbox', { name: 'Launch at startup' });
  await expect(toggle).not.toBeChecked();
  try {
    // A click, then wait: the box only flips once the app has re-read the
    // setting (`AutostartToggle`), which Playwright's check() won't wait for.
    await toggle.click();
    await expect(toggle).toBeChecked();
    await expect.poll(() => addedSince(before)).toHaveLength(1);
    expect(addedSince(before)[0]?.[1]).toMatch(DEV_EXE);

    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await expect.poll(() => runEntries()).toEqual(before);
  } finally {
    // Leave the machine as it was found, whatever happened above: remove any
    // entry this test's build added (never one that was there before).
    for (const [name, command] of addedSince(before)) {
      if (DEV_EXE.test(command)) removeRunEntry(name);
    }
    // The panel makes the timer screen inert; leave it before signing out.
    await page
      .getByRole('button', { name: 'Back to timer' })
      .click({ timeout: 5_000 })
      .catch(() => undefined);
    await signOut(page).catch(() => undefined);
  }
});

/** The debug exe these tests run, as it appears in a startup entry. */
const DEV_EXE = /src-tauri\\target\\debug\\starkeep\.exe/i;

const addedSince = (before: Record<string, string>): [string, string][] =>
  Object.entries(runEntries()).filter(([name]) => !(name in before));
