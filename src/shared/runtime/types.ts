/**
 * Runtime capability ports.
 *
 * Starkeep ships as both a Tauri desktop app and a browser build. Rather than
 * scattering `if (isDesktop)` through feature code, each host-dependent
 * capability is expressed as a small port with two implementations, and
 * features depend only on the interface.
 *
 * ## Unsupported is a no-op, never a throw
 *
 * `isSupported` exists so the UI can *hide* a control that would do nothing —
 * an autostart toggle has no meaning in a browser tab. But calling an
 * unsupported port is always safe and silent. That distinction is what keeps
 * feature code free of host branching: a timer can call `tray.setStatus(...)`
 * unconditionally and simply have nothing happen on the web.
 */

export interface NotificationPort {
  /** False in browsers without the Notification API (and in tests). */
  isSupported: boolean;
  /**
   * Ask the user for permission, returning whether it was granted. Safe to
   * call repeatedly; implementations short-circuit once decided. Returns false
   * rather than throwing when unsupported or denied.
   */
  requestPermission(): Promise<boolean>;
  /** Show a notification. Silently does nothing without permission. */
  notify(options: { title: string; body: string }): Promise<void>;
}

export interface TrayPort {
  /** Desktop only — browsers have no system tray. */
  isSupported: boolean;
  /**
   * Set the tray's hover text, or clear it with `null`.
   *
   * Windows has no persistent tray label, only a tooltip, so this is visible
   * on hover there; macOS menu bars can show it inline.
   */
  setStatus(text: string | null): Promise<void>;
}

export interface MiniWindowPort {
  /** Desktop only. */
  isSupported: boolean;
  /** Open the always-on-top mini timer, or focus it if already open. */
  open(): Promise<void>;
  close(): Promise<void>;
}

export interface AutostartPort {
  /** Desktop only. */
  isSupported: boolean;
  isEnabled(): Promise<boolean>;
  setEnabled(enabled: boolean): Promise<void>;
}

/**
 * Owns "this session ends at T" on behalf of the host.
 *
 * Exists because the webview cannot be trusted to keep time while hidden:
 * WebView2 and browsers throttle timers in minimised or background windows,
 * which is exactly when a completion notice matters. On desktop the deadline
 * lives in a Rust thread that is never throttled; on the web it is a
 * best-effort `setTimeout`.
 *
 * The JS timer still decides *that* a session completed (via `resumeVerdict`)
 * — this port only covers the notice and the tray countdown.
 */
export interface CompletionNotice {
  /** Identifies the arm for `disarm`. Any unique string — a session id, or a break's id. */
  sessionId: string;
  /** Epoch ms. */
  endsAt: number;
  title: string;
  body: string;
  /** Shown before the tray countdown, e.g. "Break · 4 min left". Omitted: "4 min left". */
  label?: string;
}

export interface CompletionPort {
  isSupported: boolean;
  /**
   * Tell the host a deadline is at `endsAt`. Replaces any previous arm.
   *
   * `then` chains a second deadline that the host arms by itself the moment
   * the first fires — used for the break after a Pomodoro block, so the
   * break's countdown and notice need nothing from a webview that may be
   * throttled at that moment. After the first fires, `disarm` takes the
   * chained notice's `sessionId`.
   */
  arm(options: CompletionNotice & { then?: CompletionNotice }): Promise<void>;
  /** Forget the deadline: no notice, tray back to the plain name. Idempotent. */
  disarm(sessionId: string): Promise<void>;
}

export type RuntimeKind = 'desktop' | 'web';

export interface Runtime {
  kind: RuntimeKind;
  notifications: NotificationPort;
  tray: TrayPort;
  miniWindow: MiniWindowPort;
  autostart: AutostartPort;
  completion: CompletionPort;
}

/**
 * Ports that do nothing, used for every capability the web build lacks and as
 * the base for tests. Declared once here so each unsupported port does not
 * hand-roll its own empty methods.
 */
// Written as `Promise.resolve(...)` rather than `async`: these satisfy an
// asynchronous interface while doing no asynchronous work, and saying so
// plainly keeps them honest (and keeps `require-await` quiet).
export const unsupportedTray: TrayPort = {
  isSupported: false,
  setStatus: () => Promise.resolve(),
};

export const unsupportedMiniWindow: MiniWindowPort = {
  isSupported: false,
  open: () => Promise.resolve(),
  close: () => Promise.resolve(),
};

export const unsupportedAutostart: AutostartPort = {
  isSupported: false,
  isEnabled: () => Promise.resolve(false),
  setEnabled: () => Promise.resolve(),
};

export const unsupportedNotifications: NotificationPort = {
  isSupported: false,
  requestPermission: () => Promise.resolve(false),
  notify: () => Promise.resolve(),
};

export const unsupportedCompletion: CompletionPort = {
  isSupported: false,
  arm: () => Promise.resolve(),
  disarm: () => Promise.resolve(),
};
