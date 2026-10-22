import { expect, test } from '@playwright/test';

import { expectSignedIn, signIn, signOut } from '../support/app';
import { settle } from '../support/devices';
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
    await signOut(page).catch(() => undefined);
  }
});

/** The debug exe these tests run, as it appears in a startup entry. */
const DEV_EXE = /src-tauri\\target\\debug\\starkeep\.exe/i;

const addedSince = (before: Record<string, string>): [string, string][] =>
  Object.entries(runEntries()).filter(([name]) => !(name in before));
