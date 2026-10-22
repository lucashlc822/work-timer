import { defineConfig, devices } from '@playwright/test';

import { localStack } from './e2e/support/localStack';

/**
 * End-to-end tests, against the local Supabase stack only (see
 * e2e/support/localStack.ts). `npm run e2e` runs everything; `npm run e2e:web`
 * the browser specs and the API specs.
 *
 * The app is a production build in mode `e2e`, served by `vite preview`: the
 * service worker only exists in a build, and mode `e2e` never loads
 * `.env.production.local`. The server's address is passed in the environment,
 * which Vite ranks above every .env file, and e2e/check-build.mjs refuses to
 * serve a build that mentions a hosted address.
 *
 * No retries: a test that passes only on a second try is a finding to report,
 * not something to hide.
 */

const stack = localStack();
const PORT = 4174;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  ...(process.env.CI ? { workers: 2 } : {}),
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 60_000,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'web', testDir: './e2e/web', use: { ...devices['Desktop Chrome'] } },
    { name: 'api', testDir: './e2e/api' },
    // Report-only Lighthouse (`npm run perf:lighthouse`); not part of `npm run e2e`.
    { name: 'perf', testDir: './e2e/perf' },
    // The Windows desktop app over WebView2's DevTools port (`npm run e2e:desktop`):
    // local only, one app at a time, not part of `npm run e2e`.
    {
      name: 'desktop',
      testDir: './e2e/desktop',
      fullyParallel: false,
      timeout: 600_000,
      // Traces and screenshots belong to browsers Playwright launched; this one
      // is the app's own WebView2, which is closed under them at the end.
      use: { trace: 'off', screenshot: 'off', video: 'off' },
    },
    // The desktop update notice against a throwaway key and a local "release"
    // (`npm run e2e:update`): makes a release build, so slow and run by hand.
    {
      name: 'desktop-update',
      testDir: './e2e/desktop-update',
      fullyParallel: false,
      timeout: 40 * 60_000,
      use: { trace: 'off', screenshot: 'off', video: 'off' },
    },
  ],
  webServer: {
    command:
      'npx vite build --mode e2e && node e2e/check-build.mjs && ' +
      `npx vite preview --mode e2e --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      VITE_SUPABASE_URL: stack.url,
      VITE_SUPABASE_PUBLISHABLE_KEY: stack.publishableKey,
    },
  },
});
