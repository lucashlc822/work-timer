import { execSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import { launchDesktop, type Desktop } from '../desktop/launch';
import { invokeTauri } from '../desktop/tauri';
import { expectSignedIn, signIn } from '../support/app';
import { localStack } from '../support/localStack';
import { createUser } from '../support/users';

/**
 * The desktop update notice, end to end, without going near the real release
 * or the real signing key (`npm run e2e:update`; slow: it makes a release
 * build, ~5-10 minutes).
 *
 * - A throwaway key pair is made in a temp folder. Its public key goes into a
 *   config overlay for this one build; `src-tauri/tauri.conf.json` is never
 *   written, and the test fails if the overlay's key were the real one.
 * - The overlay points the updater at a server on this machine, which offers
 *   "the next version" with a signed dummy payload. The test never installs
 *   it: the point is the notice, not Tauri's installer.
 * - The release build's frontend is the e2e build (local server only, checked
 *   by e2e/check-build.mjs), not `npm run build`, which would read
 *   `.env.production.local`.
 *
 * Pass: the notice offers the new version when no session is running, and is
 * gone while one is (CLAUDE.md: updates are never offered mid-session).
 */

const exe = resolve(process.cwd(), 'src-tauri', 'target', 'release', 'starkeep.exe');

const run = (command: string, env: NodeJS.ProcessEnv = process.env, timeout = 60_000) => {
  const result = spawnSync(command, { shell: true, encoding: 'utf8', env, timeout });
  if (result.status !== 0) {
    throw new Error(
      `${command} failed (${result.status}):\n${(result.stderr || result.stdout).slice(-3000)}`,
    );
  }
  return result.stdout;
};

const nextPatch = (version: string): string => {
  const [major, minor, patch] = version.split('.').map(Number);
  return `${major}.${minor}.${(patch ?? 0) + 1}`;
};

test('a newer release is offered between sessions, and never during one', async () => {
  test.setTimeout(40 * 60_000);
  test.skip(process.platform !== 'win32', 'The desktop app is Windows only.');

  const stack = localStack();
  const realKey = (
    JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')) as {
      plugins: { updater: { pubkey: string } };
    }
  ).plugins.updater.pubkey;
  const current = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;
  const offered = nextPatch(current);

  const dir = mkdtempSync(join(tmpdir(), 'starkeep-update-test-'));
  const key = join(dir, 'throwaway.key');
  let server: Server | undefined;
  let desktop: Desktop | undefined;
  try {
    // 1. A throwaway key, and a dummy "installer" signed with it.
    run(`npx tauri signer generate --ci -p "" -w "${key}"`);
    const pubkey = readFileSync(`${key}.pub`, 'utf8').trim();
    expect(pubkey, 'the throwaway key must not be the real one').not.toBe(realKey);
    const payload = join(dir, 'Starkeep-next-setup.exe');
    writeFileSync(payload, 'not a real installer: this test never installs');
    run(`npx tauri signer sign -f "${key}" -p "" "${payload}"`);
    const signature = readFileSync(`${payload}.sig`, 'utf8').trim();

    // 2. The local "release": latest.json and the payload.
    let manifestRequests = 0;
    server = createServer((req, res) => {
      const base = `http://127.0.0.1:${(server!.address() as { port: number }).port}`;
      if (req.url === '/latest.json') {
        manifestRequests += 1;
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            version: offered,
            notes: 'End-to-end test release.',
            pub_date: new Date().toISOString(),
            platforms: { 'windows-x86_64': { signature, url: `${base}/payload` } },
          }),
        );
      } else if (req.url === '/payload') {
        res.end(readFileSync(payload));
      } else {
        res.statusCode = 404;
        res.end();
      }
    });
    await new Promise<void>((done) => server!.listen(0, '127.0.0.1', done));
    const port = (server.address() as { port: number }).port;

    // 3. A release build with the overlay (throwaway key, local endpoint, e2e frontend).
    const overlay = join(dir, 'tauri.update-test.conf.json');
    writeFileSync(
      overlay,
      JSON.stringify({
        build: { beforeBuildCommand: 'npx vite build --mode e2e && node e2e/check-build.mjs' },
        plugins: {
          updater: {
            pubkey,
            endpoints: [`http://127.0.0.1:${port}/latest.json`],
            dangerousInsecureTransportProtocol: true,
          },
        },
      }),
    );
    run(
      `npx tauri build --no-bundle --config "${overlay}"`,
      {
        ...process.env,
        VITE_SUPABASE_URL: stack.url,
        VITE_SUPABASE_PUBLISHABLE_KEY: stack.publishableKey,
      },
      30 * 60_000,
    );

    // 4. Run it.
    desktop = await launchDesktop({ exe });
    const page = desktop.page;

    // A release build has no test-only command (it is compiled out).
    await expect(invokeTauri(page, 'debug_native_log')).rejects.toThrow();

    // The app looks for updates ~10 s after it opens, and offers this one on
    // the sign-in screen (nothing to interrupt there).
    const notice = page.getByText(`Starkeep ${offered} is ready.`);
    await expect.poll(() => manifestRequests, { timeout: 60_000 }).toBeGreaterThan(0);
    await expect(notice).toBeVisible({ timeout: 15_000 });

    // Signed in and idle: still offered.
    const user = await createUser('update');
    await signIn(page, user);
    await expectSignedIn(page);
    await expect(notice).toBeVisible();
    await expect(page.getByRole('button', { name: 'Restart to update' })).toBeVisible();

    // During a session: gone, and stays gone.
    await page.getByRole('button', { name: 'Start 25 min' }).click();
    await expect(page.getByRole('timer')).toBeVisible();
    await expect(notice).toBeHidden();
    await page.waitForTimeout(3_000);
    await expect(notice).toBeHidden();
    await expect(page.getByRole('button', { name: 'Restart to update' })).toHaveCount(0);

    // Session over: offered again. (Not clicked: this test never installs.)
    await page.getByRole('button', { name: 'End early' }).click();
    await page.getByRole('button', { name: 'End session' }).click();
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(notice).toBeVisible();
    await expect(page.getByRole('button', { name: 'Restart to update' })).toBeVisible();
  } finally {
    await desktop?.stop();
    await new Promise<void>((done) => (server ? server.close(() => done()) : done()));
    rmSync(dir, { recursive: true, force: true });
  }

  // The real configuration was never touched.
  expect(() => execSync('git diff --quiet -- src-tauri/tauri.conf.json')).not.toThrow();
});
