import {
  unsupportedAutostart,
  unsupportedMiniWindow,
  unsupportedNotifications,
  unsupportedTray,
  type CompletionPort,
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

/**
 * A `setTimeout` to the deadline, then a notification.
 *
 * Best-effort by nature: background tabs throttle timers to roughly once a
 * minute, so a hidden tab's notice can arrive late. The session itself is
 * unaffected — completion is decided from timestamps, not by this timer.
 */
const webCompletion = (notifications: NotificationPort): CompletionPort => {
  let armed: { sessionId: string; timer: ReturnType<typeof setTimeout> } | null = null;

  const clear = () => {
    if (armed !== null) clearTimeout(armed.timer);
    armed = null;
  };

  return {
    isSupported: notifications.isSupported,

    arm({ sessionId, endsAt, title, body }) {
      clear();
      const timer = setTimeout(
        () => {
          armed = null;
          void notifications.notify({ title, body });
        },
        Math.max(0, endsAt - Date.now()),
      );
      armed = { sessionId, timer };
      return Promise.resolve();
    },

    disarm(sessionId) {
      if (armed?.sessionId === sessionId) clear();
      return Promise.resolve();
    },
  };
};

export const createWebRuntime = (): Runtime => {
  const notifications = webNotifications();
  return {
    kind: 'web',
    notifications,
    tray: unsupportedTray,
    miniWindow: unsupportedMiniWindow,
    autostart: unsupportedAutostart,
    completion: webCompletion(notifications),
  };
};
