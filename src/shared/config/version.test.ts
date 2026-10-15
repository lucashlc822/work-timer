import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { checkVersion } from '../../../scripts/set-version.mjs';
import { APP_VERSION, compareVersions } from './version';

// Resolved from the project root: `import.meta.url` isn't a file:// URL under Vitest.
const readJson = (path: string) =>
  JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8')) as { version: string };

describe('app version', () => {
  it('is package.json’s version', () => {
    expect(APP_VERSION).toBe(readJson('package.json').version);
  });

  // The web package, its lockfile, the Tauri config and the Rust crate with its
  // lockfile all state the version; the release workflow refuses a tag that
  // doesn't match them. `npm run version:set` is how they move together.
  it('is the one version every file states', () => {
    expect(checkVersion(process.cwd(), readJson('package.json').version)).toEqual([]);
  });
});

describe('compareVersions', () => {
  it.each([
    ['0.1.0', '0.1.0', 0],
    ['0.1.0', '0.2.0', -1],
    ['0.1.0', '0.0.9', 1],
    ['0.1.0', '1.0.0-beta', -1],
    ['1.0.0-beta', '1.0.0', 0],
    ['0.10.0', '0.9.0', 1],
    [' 0.1.0 ', '0.1.0', 0],
    ['0.1.0', 'abc', null],
    ['0.1.0', '', null],
    ['0.1', '0.1.0', null],
  ] as const)('%s vs %s → %s', (a, b, expected) => {
    expect(compareVersions(a, b)).toBe(expected);
  });
});
