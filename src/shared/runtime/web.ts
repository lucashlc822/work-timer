import {
  unsupportedAutostart,
  unsupportedMiniWindow,
  unsupportedNotifications,
  unsupportedTray,
  type CompletionNotice,
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
  /** Every notice of the current arm, so an identical re-arm can be ignored. */
  let chain: CompletionNotice[] = [];

  const clear = () => {
    if (armed !== null) clearTimeout(armed.timer);
    armed = null;
  };

  const holds = (n: CompletionNotice) =>
    armed !== null && chain.some((c) => c.sessionId === n.sessionId && c.endsAt === n.endsAt);

  return {
    isSupported: notifications.isSupported,

    arm({ then, ...first }) {
      // Same rule as the desktop host: re-arming a notice already in this
      // chain changes nothing, so it cannot cut off the one before it.
      if (then === undefined && holds(first)) return Promise.resolve();

      const schedule = (notice: CompletionNotice, next?: CompletionNotice) => {
        clear();
        const timer = setTimeout(
          () => {
            armed = null;
            void notifications.notify({ title: notice.title, body: notice.body });
            if (next !== undefined) schedule(next);
          },
          Math.max(0, notice.endsAt - Date.now()),
        );
        armed = { sessionId: notice.sessionId, timer };
      };
      chain = then === undefined ? [first] : [first, then];
      schedule(first, then);
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
