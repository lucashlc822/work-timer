import { execSync, spawn } from 'node:child_process';
import { resolve } from 'node:path';

import type { Page } from '@playwright/test';

import { CDP_PORT } from './launch';

/** Calls a Tauri command from the app's own page, as its frontend would. */
export const invokeTauri = <T>(
  page: Page,
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> =>
  page.evaluate(
    ([cmd, payload]) =>
      (
        window as unknown as {
          __TAURI_INTERNALS__: { invoke: (c: string, a: unknown) => Promise<unknown> };
        }
      ).__TAURI_INTERNALS__.invoke(cmd, payload) as Promise<T>,
    [command, args] as const,
  );

export interface NativeLog {
  tooltip: string | null;
  notifications: { title: string; body: string }[];
}

/** What the app last asked Windows to show (debug builds only; see `native_log` in lib.rs). */
export const nativeLog = (page: Page): Promise<NativeLog> =>
  invokeTauri<NativeLog>(page, 'debug_native_log');

export const visibility = (page: Page): Promise<string> =>
  page.evaluate(() => document.visibilityState);

/**
 * Launches the debug exe a second time, as someone opening Starkeep from the
 * Start menu while it sits in the tray would. The single-instance plugin hands
 * that over to the running app, which shows its window, and the second process
 * exits.
 */
export const launchAgain = (): void => {
  const exe = resolve(process.cwd(), 'src-tauri', 'target', 'debug', 'starkeep.exe');
  spawn(`"${exe}"`, [], {
    shell: true,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  }).unref();
};

const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';

/** Deletes one per-user startup entry by name. */
export const removeRunEntry = (name: string): void => {
  execSync(`reg delete "${RUN_KEY}" /v "${name}" /f`, { stdio: 'ignore' });
};

/** The per-user "run at sign-in" entries, as name → command. */
export const runEntries = (): Record<string, string> => {
  const out = execSync(`reg query "${RUN_KEY}"`, { encoding: 'utf8' });
  const entries: Record<string, string> = {};
  for (const line of out.split(/\r?\n/)) {
    const match = /^\s{4}(.+?)\s{4}REG_\w+\s{4}(.*)$/.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) entries[match[1]] = match[2];
  }
  return entries;
};

/**
 * Evaluates `expression` in the main window over a plain DevTools connection,
 * with no Playwright attached (detach first). Used to read what the page
 * really reports while hidden: with Playwright attached it always says
 * "visible".
 */
export const rawEvaluate = async (expression: string): Promise<unknown> => {
  const targets = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()) as {
    type: string;
    url: string;
    webSocketDebuggerUrl: string;
  }[];
  const target = targets.find((t) => t.type === 'page' && !t.url.includes('window=mini'));
  if (target === undefined) throw new Error('No main window to evaluate in.');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve);
    socket.addEventListener('error', reject);
  });
  try {
    return await new Promise<unknown>((resolve, reject) => {
      socket.addEventListener('message', (message) => {
        const data = JSON.parse(String(message.data)) as {
          id?: number;
          result?: { result?: { value?: unknown }; exceptionDetails?: { text?: string } };
        };
        if (data.id !== 1) return;
        if (data.result?.exceptionDetails) reject(new Error(data.result.exceptionDetails.text));
        else resolve(data.result?.result?.value);
      });
      socket.send(
        JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: { expression, awaitPromise: true, returnByValue: true },
        }),
      );
    });
  } finally {
    socket.close();
  }
};

/** `invokeTauri` over the plain connection (see `rawEvaluate`). */
export const rawInvoke = <T>(command: string, args: Record<string, unknown> = {}): Promise<T> =>
  rawEvaluate(
    `window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)}, ${JSON.stringify(args)})`,
  ) as Promise<T>;
