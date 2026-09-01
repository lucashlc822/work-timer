import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { APP_DESCRIPTION, APP_NAME } from './brand';

/**
 * `brand.mjs` is the single source of the product name, and the PWA manifest
 * and HTML title both read from it at build time. `src-tauri/tauri.conf.json`
 * cannot — it is plain JSON consumed by Cargo before any JavaScript runs — so
 * the name is duplicated there.
 *
 * That duplication is the one place a rename could silently half-apply,
 * leaving the window title and installer disagreeing with the app. This test
 * makes that loud, the same way `styles/tokens.test.ts` guards the palette.
 */
describe('brand mirror', () => {
  const tauriConfig = JSON.parse(
    // Resolved from the project root: Vitest serves modules over http, so
    // `import.meta.url` is not a file:// URL here.
    readFileSync(resolve(process.cwd(), 'src-tauri/tauri.conf.json'), 'utf8'),
  ) as { productName: string; app: { windows: { title: string }[] } };

  it('matches the Tauri productName', () => {
    expect(tauriConfig.productName).toBe(APP_NAME);
  });

  it('matches the main window title', () => {
    expect(tauriConfig.app.windows[0]?.title).toBe(APP_NAME);
  });

  it('keeps the short name within a taskbar-friendly length', () => {
    expect(APP_NAME.length).toBeLessThanOrEqual(20);
  });

  it('has a description for the manifest and installer', () => {
    expect(APP_DESCRIPTION.length).toBeGreaterThan(10);
  });
});
