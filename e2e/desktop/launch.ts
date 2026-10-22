import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { chromium, type Browser, type Page } from '@playwright/test';

import { localStack } from '../support/localStack';

/**
 * The Windows desktop app under test: `tauri dev` (a debug build, so the
 * test-only `debug_native_log` command exists), driven through WebView2's
 * DevTools port by Playwright's `connectOverCDP`.
 *
 * Safety, in order of what it protects:
 * - **Production.** Vite gets the local stack's address and key in its
 *   environment, which outranks every .env file, and `localStack()` has
 *   already refused anything that isn't this computer.
 * - **The installed app.** It shares this build's identifier, so by default
 *   they'd share one WebView2 profile (sign-in, IndexedDB). Every launch here
 *   gets a fresh profile folder of its own (`WEBVIEW2_USER_DATA_FOLDER`),
 *   deleted on stop. And with the installed app running, the single-instance
 *   plugin would hand this launch over to it, so that is refused up front.
 * - **The machine.** `stop()` ends the whole process tree; stopping npm alone
 *   leaves `starkeep.exe` and Vite running (CLAUDE.md).
 */

export const CDP_PORT = 9222;
const DEV_PORT = 5173;
const DEV_ORIGIN = `http://localhost:${DEV_PORT}`;
/** Where a built exe serves its frontend from on Windows. */
const BUILT_ORIGIN = 'http://tauri.localhost';
/** The first `cargo` build of the day can take minutes. */
const START_TIMEOUT_MS = 8 * 60_000;

export interface Desktop {
  browser: Browser;
  /** The main window (not the mini timer). */
  page: Page;
  /**
   * Disconnects Playwright, leaving the app running. While Playwright is
   * attached the page always reports itself visible, so a check of what the
   * app does when hidden needs it gone (see `rawEvaluate`).
   */
  detach(): Promise<void>;
  /** Connects Playwright again; `browser` and `page` are replaced. */
  attach(): Promise<void>;
  /** The WebView2 profile folder this launch uses; gone after `stop()`. */
  profile: string;
  stop(): Promise<void>;
}

const listening = (port: number): boolean => {
  const out = execSync('netstat -ano -p tcp', { encoding: 'utf8' });
  return out.split(/\r?\n/).some((line) => line.includes(`:${port} `) && /LISTENING/.test(line));
};

const starkeepRunning = (): boolean =>
  execSync('tasklist /FI "IMAGENAME eq starkeep.exe" /NH', { encoding: 'utf8' })
    .toLowerCase()
    .includes('starkeep.exe');

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const mainPageUrl = async (origin: string): Promise<string | null> => {
  try {
    const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
    const targets = (await res.json()) as { type: string; url: string }[];
    return (
      targets.find(
        (t) => t.type === 'page' && t.url.startsWith(origin) && !t.url.includes('window=mini'),
      )?.url ?? null
    );
  } catch {
    return null;
  }
};

/**
 * `exe` runs an already-built exe (its frontend, and the server it talks to,
 * were fixed when it was built: see the update test) instead of `tauri dev`.
 */
export const launchDesktop = async (options: { exe?: string } = {}): Promise<Desktop> => {
  const origin = options.exe === undefined ? DEV_ORIGIN : BUILT_ORIGIN;
  if (process.platform !== 'win32') throw new Error('The desktop tests run on Windows only.');
  const stack = localStack();

  if (starkeepRunning()) {
    throw new Error(
      'Starkeep is already running (maybe the installed app, in the tray). Quit it from the tray ' +
        'first: a second instance would hand itself over to it.',
    );
  }
  for (const port of options.exe === undefined ? [DEV_PORT, CDP_PORT] : [CDP_PORT]) {
    if (listening(port)) {
      throw new Error(`Port ${port} is in use. Stop whatever holds it (netstat -ano) and retry.`);
    }
  }

  const profile = mkdtempSync(join(tmpdir(), 'starkeep-e2e-webview-'));
  const output: string[] = [];
  const [command, args] =
    options.exe === undefined ? ['npx', ['tauri', 'dev']] : [`"${options.exe}"`, [] as string[]];
  const child = spawn(command, args, {
    shell: true,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${CDP_PORT}`,
      WEBVIEW2_USER_DATA_FOLDER: profile,
      VITE_SUPABASE_URL: stack.url,
      VITE_SUPABASE_PUBLISHABLE_KEY: stack.publishableKey,
    },
  });
  const keep = (chunk: Buffer) => {
    output.push(chunk.toString());
    if (output.length > 200) output.shift();
  };
  child.stdout?.on('data', keep);
  child.stderr?.on('data', keep);

  let browser: Browser | null = null;

  const stop = async (): Promise<void> => {
    // Let go of the app first (for a browser connected to, this only
    // disconnects), so Playwright isn't left talking to a process being killed.
    await browser?.close().catch(() => undefined);
    if (child.pid !== undefined) {
      try {
        execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: 'ignore' });
      } catch {
        // Already gone.
      }
    }
    try {
      execSync('taskkill /IM starkeep.exe /T /F', { stdio: 'ignore' });
    } catch {
      // Not running.
    }
    for (let i = 0; i < 40 && (listening(DEV_PORT) || listening(CDP_PORT)); i += 1) {
      await sleep(250);
    }
    // WebView2 lets go of its files a moment after the process ends.
    for (let i = 0; i < 20 && existsSync(profile); i += 1) {
      try {
        rmSync(profile, { recursive: true, force: true });
      } catch {
        await sleep(250);
      }
    }
  };

  try {
    const deadline = Date.now() + START_TIMEOUT_MS;
    while ((await mainPageUrl(origin)) === null) {
      if (child.exitCode !== null) {
        throw new Error(`The app exited (${child.exitCode}):\n${output.join('').slice(-3000)}`);
      }
      if (Date.now() > deadline) {
        throw new Error(`The desktop app didn't open in time:\n${output.join('').slice(-3000)}`);
      }
      await sleep(1000);
    }

    const connect = async (): Promise<{ browser: Browser; page: Page }> => {
      const connected = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
      const found = connected
        .contexts()
        .flatMap((context) => context.pages())
        .find((p) => p.url().startsWith(origin) && !p.url().includes('window=mini'));
      if (found === undefined) throw new Error('Connected, but found no main window page.');
      return { browser: connected, page: found };
    };
    const first = await connect();
    browser = first.browser;

    // Proof the isolation took: this launch's profile folder is the one in use.
    for (let i = 0; i < 40 && readdirSync(profile).length === 0; i += 1) await sleep(250);
    if (readdirSync(profile).length === 0) {
      throw new Error(
        `WebView2 is not using the test profile (${profile}). Refusing to go on: the app would be ` +
          "sharing the installed app's profile.",
      );
    }

    const desktop: Desktop = {
      browser: first.browser,
      page: first.page,
      profile,
      stop,
      detach: async () => {
        await desktop.browser.close();
        browser = null;
      },
      attach: async () => {
        const again = await connect();
        browser = again.browser;
        desktop.browser = again.browser;
        desktop.page = again.page;
      },
    };
    return desktop;
  } catch (error) {
    await stop();
    throw error;
  }
};
