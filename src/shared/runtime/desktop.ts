import { invoke } from '@tauri-apps/api/core';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart';
import {
  isPermissionGranted,
  requestPermission as requestNotificationPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';

import type {
  AutostartPort,
  CompletionNotice,
  CompletionPort,
  MiniWindowPort,
  NotificationPort,
  Runtime,
  TrayPort,
} from './types';

/**
 * Tauri desktop implementation.
 *
 * This module is only ever reached through a dynamic import in `index.ts`, so
 * `@tauri-apps/*` lands in its own lazily-loaded chunk and never executes in
 * the browser build.
 *
 * Every port swallows its own failures. A tray tooltip that cannot be set, or
 * a notification the OS refuses, must never take down a running session — the
 * timer is the product, these are decorations on it.
 */

/** Label of the always-on-top mini timer window. Must match `src-tauri`. */
const MINI_WINDOW_LABEL = 'mini';

const desktopNotifications: NotificationPort = {
  isSupported: true,

  async requestPermission() {
    try {
      if (await isPermissionGranted()) return true;
      return (await requestNotificationPermission()) === 'granted';
    } catch {
      return false;
    }
  },

  async notify({ title, body }) {
    try {
      if (!(await isPermissionGranted())) return;
      sendNotification({ title, body });
    } catch {
      /* never break the timer over a notification */
    }
  },
};

const desktopTray: TrayPort = {
  isSupported: true,

  async setStatus(text) {
    try {
      // The tray is owned by Rust (it must outlive the webview, so the app can
      // sit in the tray with no window open). JS asks it to update.
      await invoke('set_tray_status', { text });
    } catch {
      /* tray text is cosmetic */
    }
  },
};

const desktopMiniWindow: MiniWindowPort = {
  isSupported: true,

  async open() {
    try {
      const existing = await WebviewWindow.getByLabel(MINI_WINDOW_LABEL);
      if (existing !== null) {
        await existing.show();
        await existing.setFocus();
        return;
      }

      new WebviewWindow(MINI_WINDOW_LABEL, {
        // A query parameter rather than a route: the packaged app serves the
        // frontend over an asset protocol with no index.html fallback, so a
        // client-side path would 404 in production while working in dev.
        url: 'index.html?window=mini',
        title: 'Starkeep',
        width: 240,
        height: 132,
        resizable: false,
        decorations: false,
        alwaysOnTop: true,
        // Kept out of the taskbar: this is a floating companion to the main
        // window, not a second app.
        skipTaskbar: true,
      });
    } catch {
      /* the mini window is an enhancement, not a requirement */
    }
  },

  async close() {
    try {
      const existing = await WebviewWindow.getByLabel(MINI_WINDOW_LABEL);
      await existing?.close();
    } catch {
      /* already gone */
    }
  },
};

const desktopAutostart: AutostartPort = {
  isSupported: true,

  async isEnabled() {
    try {
      return await isEnabled();
    } catch {
      return false;
    }
  },

  async setEnabled(next) {
    try {
      if (next) await enable();
      else await disable();
    } catch {
      /* the settings UI re-reads state, so a failure self-corrects visually */
    }
  },
};

const desktopCompletion: CompletionPort = {
  isSupported: true,

  async arm({ then, ...first }) {
    try {
      // The deadline lives in a Rust thread (src-tauri/src/deadline.rs): it
      // keeps the tray countdown and fires the notice on time even while
      // WebView2 is throttling this hidden window. Each stage is a
      // `deadline::Stage`, so its keys are the camelCase of that struct.
      const stage = (n: CompletionNotice) => ({ ...n, endsAt: Math.round(n.endsAt) });
      await invoke('arm_deadline', {
        stages: then === undefined ? [stage(first)] : [stage(first), stage(then)],
      });
    } catch {
      /* the in-app result screen still records the completion */
    }
  },

  async disarm(sessionId) {
    try {
      await invoke('disarm_deadline', { sessionId });
    } catch {
      /* nothing armed */
    }
  },
};

export const createDesktopRuntime = (): Runtime => ({
  kind: 'desktop',
  notifications: desktopNotifications,
  tray: desktopTray,
  miniWindow: desktopMiniWindow,
  autostart: desktopAutostart,
  completion: desktopCompletion,
});
