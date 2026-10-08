import { afterEach, describe, expect, it, vi } from 'vitest';

import { getRuntime, isDesktop, resetRuntimeForTests } from './index';
import {
  unsupportedAutostart,
  unsupportedCompletion,
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
    await expect(
      unsupportedCompletion.arm({ sessionId: 's', endsAt: 0, title: 'a', body: 'b' }),
    ).resolves.toBeUndefined();
    await expect(unsupportedCompletion.disarm('s')).resolves.toBeUndefined();
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

describe('web completion', () => {
  const grantedNotification = () => {
    const construct = vi.fn();
    const Notification = Object.assign(construct, {
      permission: 'granted',
      requestPermission: vi.fn(),
    });
    stubWindow({ Notification });
    return construct;
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  it('notifies once the deadline passes', async () => {
    vi.useFakeTimers({ now: 1_000 });
    const construct = grantedNotification();
    const runtime = await getRuntime();

    await runtime.completion.arm({ sessionId: 's1', endsAt: 61_000, title: 'Done', body: 'b' });
    vi.advanceTimersByTime(59_999);
    expect(construct).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(construct).toHaveBeenCalledWith('Done', { body: 'b' });
  });

  it('stays silent after a disarm', async () => {
    vi.useFakeTimers({ now: 1_000 });
    const construct = grantedNotification();
    const runtime = await getRuntime();

    await runtime.completion.arm({ sessionId: 's1', endsAt: 61_000, title: 'Done', body: 'b' });
    await runtime.completion.disarm('s1');
    vi.advanceTimersByTime(120_000);

    expect(construct).not.toHaveBeenCalled();
  });

  it('replaces an earlier arm rather than firing twice', async () => {
    vi.useFakeTimers({ now: 1_000 });
    const construct = grantedNotification();
    const runtime = await getRuntime();

    await runtime.completion.arm({ sessionId: 's1', endsAt: 61_000, title: 'Done', body: 'b' });
    await runtime.completion.arm({ sessionId: 's1', endsAt: 61_000, title: 'Done', body: 'b' });
    vi.advanceTimersByTime(120_000);

    expect(construct).toHaveBeenCalledTimes(1);
  });

  it('ignores a disarm for a different session', async () => {
    vi.useFakeTimers({ now: 1_000 });
    const construct = grantedNotification();
    const runtime = await getRuntime();

    await runtime.completion.arm({ sessionId: 's2', endsAt: 61_000, title: 'Done', body: 'b' });
    await runtime.completion.disarm('s1');
    vi.advanceTimersByTime(60_000);

    expect(construct).toHaveBeenCalledTimes(1);
  });

  const chained = {
    sessionId: 's1',
    endsAt: 61_000,
    title: 'Done',
    body: 'block',
    then: { sessionId: 'break:r:1', endsAt: 121_000, title: 'Done', body: 'break', label: 'Break' },
  };

  it('fires a chained notice after the first, with no second arm', async () => {
    vi.useFakeTimers({ now: 1_000 });
    const construct = grantedNotification();
    const runtime = await getRuntime();

    await runtime.completion.arm(chained);
    vi.advanceTimersByTime(60_000);
    expect(construct).toHaveBeenLastCalledWith('Done', { body: 'block' });

    vi.advanceTimersByTime(60_000);
    expect(construct).toHaveBeenLastCalledWith('Done', { body: 'break' });
    expect(construct).toHaveBeenCalledTimes(2);
  });

  it('disarms the chained notice by its own id once the first has fired', async () => {
    vi.useFakeTimers({ now: 1_000 });
    const construct = grantedNotification();
    const runtime = await getRuntime();

    await runtime.completion.arm(chained);
    vi.advanceTimersByTime(60_000);
    await runtime.completion.disarm('break:r:1');
    vi.advanceTimersByTime(120_000);

    expect(construct).toHaveBeenCalledTimes(1);
  });

  it('re-arming the chained notice before the first fires keeps both notices', async () => {
    vi.useFakeTimers({ now: 1_000 });
    const construct = grantedNotification();
    const runtime = await getRuntime();

    await runtime.completion.arm(chained);
    vi.advanceTimersByTime(59_000);
    await runtime.completion.arm(chained.then);
    vi.advanceTimersByTime(120_000);

    expect(construct).toHaveBeenCalledTimes(2);
    expect(construct).toHaveBeenNthCalledWith(1, 'Done', { body: 'block' });
  });

  it('cancelling before the first fires drops the chain too', async () => {
    vi.useFakeTimers({ now: 1_000 });
    const construct = grantedNotification();
    const runtime = await getRuntime();

    await runtime.completion.arm(chained);
    await runtime.completion.disarm('s1');
    vi.advanceTimersByTime(300_000);

    expect(construct).not.toHaveBeenCalled();
  });
});
