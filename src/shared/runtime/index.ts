import { isStandalone } from '../lib/platform';
import { createWebRuntime } from './web';
import type { Runtime } from './types';

export type {
  AutostartPort,
  CompletionNotice,
  CompletionPort,
  MiniWindowPort,
  NotificationPort,
  Runtime,
  RuntimeKind,
  TrayPort,
} from './types';

/**
 * Host detection, done exactly once.
 *
 * Tauri 2 injects `__TAURI_INTERNALS__` into the webview before any app code
 * runs, which is the officially supported way to tell the two hosts apart.
 * Feature code must never re-detect — it takes a `Runtime` and uses it.
 */
export const isDesktop = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

let runtime: Runtime | null = null;

/**
 * Resolve the runtime for this host.
 *
 * Async because the desktop implementation is dynamically imported, which
 * keeps `@tauri-apps/*` out of the browser bundle's main chunk. The result is
 * memoised, so callers can treat it as cheap after the first await.
 *
 * Falls back to the web runtime if the desktop module fails to load. That
 * degrades the app to "no tray, no autostart" rather than to a blank screen —
 * always the right trade for a timer.
 */
export const getRuntime = async (): Promise<Runtime> => {
  if (runtime !== null) return runtime;

  if (isDesktop()) {
    try {
      const { createDesktopRuntime } = await import('./desktop');
      runtime = createDesktopRuntime();
      return runtime;
    } catch (error) {
      console.error('Falling back to the web runtime — desktop load failed', error);
    }
  }

  runtime = createWebRuntime();
  return runtime;
};

/**
 * Coarse label for where a session was recorded, stored on the session row so
 * cross-device history stays legible once sync lands in M5.
 *
 * Takes the runtime rather than detecting, so it stays honest about which host
 * actually produced the value.
 */
export const describeHost = (host: Runtime): string =>
  host.kind === 'desktop' ? 'desktop/app' : isStandalone() ? 'web/installed' : 'web/browser';

/** Test seam: forget the memoised runtime. */
export const resetRuntimeForTests = (): void => {
  runtime = null;
};
