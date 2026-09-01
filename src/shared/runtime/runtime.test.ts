import { afterEach, describe, expect, it, vi } from 'vitest';

import { getRuntime, isDesktop, resetRuntimeForTests } from './index';
import {
  unsupportedAutostart,
  unsupportedMiniWindow,
  unsupportedNotifications,
  unsupportedTray,
} from './types';

/**
 * Deliberately runs in the `node` environment, with `window` stubbed by hand.
 *
 * The runtime layer only ever touches two globals — `window` and
 * `Notification` — so faking them costs three lines, where pulling in jsdom to
 * get them costs roughly a minute of setup on every single test run. See the
 * environment note in CLAUDE.md.
 */

/** Install a fake `window`, optionally carrying a Notification stub or the Tauri marker. */
const stubWindow = (props: Record<string, unknown> = {}): void => {
  vi.stubGlobal('window', props);
  if ('Notification' in props) {
    vi.stubGlobal('Notification', props.Notification);
  }
};

afterEach(() => {
  resetRuntimeForTests();
  vi.unstubAllGlobals();
});

describe('host detection', () => {
  it('reports web when Tauri has not injected itself', () => {
    stubWindow();
    expect(isDesktop()).toBe(false);
  });

  it('reports desktop when the Tauri marker is present', () => {
    stubWindow({ __TAURI_INTERNALS__: {} });
    expect(isDesktop()).toBe(true);
  });

  it('does not crash when there is no window at all', () => {
    expect(isDesktop()).toBe(false);
  });
});

describe('web runtime', () => {
  it('resolves to the web runtime in a browser', async () => {
    stubWindow();
    expect((await getRuntime()).kind).toBe('web');
  });

  it('memoises, so repeated calls return the same instance', async () => {
    stubWindow();
    expect(await getRuntime()).toBe(await getRuntime());
  });

  it('reports every desktop-only capability as unsupported', async () => {
    stubWindow();
    const runtime = await getRuntime();

    expect(runtime.tray.isSupported).toBe(false);
    expect(runtime.miniWindow.isSupported).toBe(false);
    expect(runtime.autostart.isSupported).toBe(false);
  });

  /**
   * The whole point of the port design: feature code calls these
   * unconditionally, so an unsupported capability must be silent rather than
   * throwing. If any of these rejected, timer code would need host branching.
   */
  it('makes every unsupported port a silent no-op', async () => {
    await expect(unsupportedTray.setStatus('25:00')).resolves.toBeUndefined();
    await expect(unsupportedMiniWindow.open()).resolves.toBeUndefined();
    await expect(unsupportedMiniWindow.close()).resolves.toBeUndefined();
    await expect(unsupportedAutostart.setEnabled(true)).resolves.toBeUndefined();
    await expect(unsupportedAutostart.isEnabled()).resolves.toBe(false);
    await expect(
      unsupportedNotifications.notify({ title: 'a', body: 'b' }),
    ).resolves.toBeUndefined();
    await expect(unsupportedNotifications.requestPermission()).resolves.toBe(false);
  });
});

describe('web notifications', () => {
  it('degrades to unsupported when the browser has no Notification API', async () => {
    stubWindow();
    const runtime = await getRuntime();

    expect(runtime.notifications.isSupported).toBe(false);
    await expect(runtime.notifications.notify({ title: 'a', body: 'b' })).resolves.toBeUndefined();
  });

  it('does not prompt again once permission was denied', async () => {
    const requestPermission = vi.fn();
    stubWindow({ Notification: { permission: 'denied', requestPermission } });

    const runtime = await getRuntime();

    expect(await runtime.notifications.requestPermission()).toBe(false);
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('does not re-prompt once permission was granted', async () => {
    const requestPermission = vi.fn();
    stubWindow({ Notification: { permission: 'granted', requestPermission } });

    const runtime = await getRuntime();

    expect(await runtime.notifications.requestPermission()).toBe(true);
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('treats a rejected permission request as a refusal, not an error', async () => {
    stubWindow({
      Notification: {
        permission: 'default',
        requestPermission: vi.fn().mockRejectedValue(new Error('needs a user gesture')),
      },
    });

    const runtime = await getRuntime();

    await expect(runtime.notifications.requestPermission()).resolves.toBe(false);
  });

  it('stays silent when asked to notify without permission', async () => {
    const construct = vi.fn();
    stubWindow({ Notification: { permission: 'denied', requestPermission: vi.fn() } });
    vi.stubGlobal(
      'Notification',
      Object.assign(construct, { permission: 'denied', requestPermission: vi.fn() }),
    );

    const runtime = await getRuntime();
    await runtime.notifications.notify({ title: 'a', body: 'b' });

    expect(construct).not.toHaveBeenCalled();
  });
});
