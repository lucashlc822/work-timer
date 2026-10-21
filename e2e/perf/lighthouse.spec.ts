import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { chromium, expect, test, type TestInfo } from '@playwright/test';

import { expectSignedIn, signIn } from '../support/app';
import { createUser } from '../support/users';

/**
 * Report-only page-load performance with Lighthouse (desktop preset), against
 * the same e2e build the other tests use, served on this machine.
 *
 *   npm run perf:lighthouse
 *
 * Two pages: the sign-in screen, and the signed-in home (the timer in front of
 * the sky). Lighthouse measures loading, so a screen reached by clicking, like
 * "View sky", isn't a separate measurement; the home page carries the sky
 * backdrop it shares.
 *
 * Nothing here fails on a number. The scores are attached to the report and
 * printed as a table; the only assertion is that Lighthouse produced a result.
 * Scores vary a few points run to run and between machines, so read them as a
 * trend, not a gate. Lighthouse is fetched by `npx` at a pinned version rather
 * than installed as a dependency: it is large, and only this script uses it.
 */

const LIGHTHOUSE = 'lighthouse@12.8.2';
/** One port per browser: a closing browser can keep its port briefly. */
let nextPort = 9333;

interface Summary {
  page: string;
  score: number;
  fcpMs: number;
  lcpMs: number;
  tbtMs: number;
  cls: number;
}

const runLighthouse = (
  url: string,
  port: number,
  page: string,
  outFile: string,
  keepStorage: boolean,
): Summary => {
  const result = spawnSync(
    'npx',
    [
      '--yes',
      LIGHTHOUSE,
      url,
      `--port=${port}`,
      '--preset=desktop',
      '--only-categories=performance',
      '--output=json',
      // Quoted: the command goes through a shell, and this path has spaces.
      `--output-path="${outFile}"`,
      ...(keepStorage ? ['--disable-storage-reset'] : []),
    ],
    { encoding: 'utf8', shell: true, timeout: 180_000 },
  );
  expect(result.status, `Lighthouse failed:\n${result.stderr}`).toBe(0);

  const report = JSON.parse(readFileSync(outFile, 'utf8')) as {
    categories: { performance: { score: number } };
    audits: Record<string, { numericValue?: number }>;
  };
  const audit = (id: string) => report.audits[id]?.numericValue ?? Number.NaN;
  return {
    page,
    score: Math.round(report.categories.performance.score * 100),
    fcpMs: Math.round(audit('first-contentful-paint')),
    lcpMs: Math.round(audit('largest-contentful-paint')),
    tbtMs: Math.round(audit('total-blocking-time')),
    cls: Math.round(audit('cumulative-layout-shift') * 1000) / 1000,
  };
};

const publish = async (testInfo: TestInfo, rows: Summary[]) => {
  const table = [
    '| Page | Score | First paint | Largest paint | Blocking time | Layout shift |',
    '|---|---|---|---|---|---|',
    ...rows.map(
      (r) =>
        `| ${r.page} | ${r.score} | ${r.fcpMs} ms | ${r.lcpMs} ms | ${r.tbtMs} ms | ${r.cls} |`,
    ),
  ].join('\n');
  console.log(`\nLighthouse (desktop, report only)\n${table}\n`);
  await testInfo.attach('lighthouse-summary.md', { body: table, contentType: 'text/markdown' });
};

/**
 * An installed Chrome or Edge. Playwright's own browsers aren't used: its
 * headless shell can't be shared with Lighthouse (Playwright keeps the pages it
 * drives paused for itself), and its full Chromium doesn't start on every
 * machine. `CHROME_PATH` overrides the search.
 */
const findChrome = (): string | null => {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  return candidates.find((path) => path !== undefined && existsSync(path)) ?? null;
};

/**
 * Starts that browser with a debugging port, so Playwright (to sign in) and
 * Lighthouse (to measure) can drive the same browser in turn, and the session
 * made by one is there for the other.
 */
const startChrome = async (exe: string, port: number): Promise<ChildProcess> => {
  const dir = mkdtempSync(join(tmpdir(), 'starkeep-lighthouse-'));
  const quote = (value: string) => `"${value}"`;
  const chrome = spawn(
    quote(exe),
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${quote(dir)}`,
      '--headless=new',
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ],
    { shell: true, stdio: 'ignore', windowsHide: true },
  );
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) return chrome;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  chrome.kill();
  throw new Error(`${exe} did not open its debugging port.`);
};

/** Runs `task` with a fresh browser (own profile), then closes it. */
const withChrome = async <T>(exe: string, task: (port: number) => Promise<T>): Promise<T> => {
  const port = nextPort++;
  const chrome = await startChrome(exe, port);
  try {
    return await task(port);
  } finally {
    // Closing through the browser itself ends every process it started; the
    // shell wrapper around it would otherwise leave them running.
    try {
      const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
      await (await browser.newBrowserCDPSession()).send('Browser.close');
    } catch {
      // Already gone.
    }
    chrome.kill();
  }
};

test('Lighthouse: sign-in and signed-in home (report only)', async ({ baseURL }, testInfo) => {
  test.setTimeout(420_000);
  const exe = findChrome();
  test.skip(exe === null, 'No installed Chrome or Edge found (set CHROME_PATH).');
  const user = await createUser('lighthouse');
  const url = `${baseURL}/`;
  const rows: Summary[] = [];

  // Signed out, in a browser that has never seen the app. (Each measurement
  // gets its own browser: after Lighthouse's run, a page opened in the same
  // browser did not finish loading.)
  await withChrome(exe!, (port) => {
    rows.push(
      runLighthouse(url, port, 'Sign in', testInfo.outputPath('lighthouse-sign-in.json'), false),
    );
    return Promise.resolve();
  });

  // Signed in: sign in through Playwright in a fresh browser, close that page,
  // and have Lighthouse load the home page without wiping the session.
  await withChrome(exe!, async (port) => {
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = await context.newPage();
    await page.goto(url);
    await signIn(page, user);
    await expectSignedIn(page);
    await page.close();
    // Let go of the browser before Lighthouse takes over: while Playwright is
    // attached it holds every new page for itself, and Lighthouse's navigation
    // times out. (For a browser it connected to, close() only disconnects.)
    await browser.close();
    rows.push(
      runLighthouse(
        url,
        port,
        'Home (signed in)',
        testInfo.outputPath('lighthouse-home.json'),
        true,
      ),
    );
  });

  await publish(testInfo, rows);
  expect(rows.every((r) => r.score >= 0 && r.score <= 100)).toBe(true);
});
