import {
  unsupportedAutostart,
  unsupportedMiniWindow,
  unsupportedNotifications,
  unsupportedTray,
  type NotificationPort,
  type Runtime,
} from './types';

/**
 * Browser implementation.
 *
 * Only notifications have a web equivalent; tray, mini window, and autostart
 * are inherently desktop concerns and report `isSupported: false`.
 */

const webNotifications = (): NotificationPort => {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return unsupportedNotifications;
  }

  return {
    isSupported: true,

    async requestPermission() {
      // Already decided — asking again is a no-op in browsers anyway, and
      // re-prompting a user who said no is hostile.
      if (Notification.permission === 'granted') return true;
      if (Notification.permission === 'denied') return false;

      try {
        return (await Notification.requestPermission()) === 'granted';
      } catch {
        // Older Safari rejects rather than resolving when called outside a
        // user gesture. A failed request is simply "no".
        return false;
      }
    },

    // Synchronous underneath, but the port is async so the desktop
    // implementation can await Tauri's IPC.
    notify({ title, body }) {
      if (Notification.permission === 'granted') {
        try {
          new Notification(title, { body });
        } catch {
          // Some browsers only permit notifications from a service worker
          // registration. Failing to notify must never break the timer.
        }
      }
      return Promise.resolve();
    },
  };
};

export const createWebRuntime = (): Runtime => ({
  kind: 'web',
  notifications: webNotifications(),
  tray: unsupportedTray,
  miniWindow: unsupportedMiniWindow,
  autostart: unsupportedAutostart,
});
