import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { APP_VERSION, compareVersions } from './version';

// Resolved from the project root: `import.meta.url` isn't a file:// URL under Vitest.
const readJson = (path: string) =>
  JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8')) as { version: string };

describe('app version', () => {
  it('is package.json’s version', () => {
    expect(APP_VERSION).toBe(readJson('package.json').version);
  });

  it('matches the desktop app’s version, so both builds report the same one', () => {
    expect(readJson('src-tauri/tauri.conf.json').version).toBe(readJson('package.json').version);
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
