import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  checkVersion,
  parseVersion,
  readVersions,
  setVersion,
} from '../../../scripts/set-version.mjs';

// Resolved from the project root: `import.meta.url` isn't a file:// URL under Vitest.
const REPO = process.cwd();

const FILES = [
  'package.json',
  'package-lock.json',
  'src-tauri/tauri.conf.json',
  'src-tauri/Cargo.toml',
  'src-tauri/Cargo.lock',
];

const temps: string[] = [];
afterEach(() => {
  while (temps.length > 0) rmSync(temps.pop()!, { recursive: true, force: true });
});

/** A scratch copy of just the version-bearing files, so tests never touch the repo. */
const scratchCopy = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'set-version-'));
  temps.push(root);
  for (const file of FILES) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    cpSync(resolve(REPO, file), join(root, file));
  }
  return root;
};

const read = (root: string, file: string) => readFileSync(join(root, file), 'utf8');

describe('set-version', () => {
  it('rewrites all five files, and changes nothing else in them', () => {
    const root = scratchCopy();
    const before = Object.fromEntries(FILES.map((f) => [f, read(root, f)]));

    setVersion(root, '7.8.9');

    expect(checkVersion(root, '7.8.9')).toEqual([]);
    for (const file of FILES) {
      const was = before[file]!.split('\n');
      const now = read(root, file).split('\n');
      expect(now).toHaveLength(was.length);
      const changed = now.filter((line, i) => line !== was[i]);
      // The lockfile states the version twice; every other file once.
      expect(changed.length, file).toBe(file === 'package-lock.json' ? 2 : 1);
      for (const line of changed) expect(line).toContain('7.8.9');
    }
  });

  it('reads the repository as being on one version', () => {
    const versions = readVersions(REPO).flatMap((f) => f.versions);
    expect(new Set(versions).size).toBe(1);
    expect(versions).not.toContain(null);
  });

  it.each(['1.2', 'v1.2.3', '1.2.3-beta', '1.2.3.4', '', 'latest'])(
    'refuses "%s" and leaves every file as it was',
    (bad) => {
      const root = scratchCopy();
      const before = FILES.map((f) => read(root, f));

      expect(() => setVersion(root, bad)).toThrow();

      expect(FILES.map((f) => read(root, f))).toEqual(before);
    },
  );

  it('accepts a release tag when checking, with or without the v', () => {
    expect(parseVersion('v0.2.0')).toBe('0.2.0');
    expect(parseVersion('0.2.0')).toBe('0.2.0');
    expect(() => parseVersion('v0.2')).toThrow();
  });

  it('names the files that disagree with a tag', () => {
    const root = scratchCopy();
    setVersion(root, '0.3.0');
    // One file left behind: exactly what a half-done bump looks like.
    cpSync(resolve(REPO, 'src-tauri/Cargo.toml'), join(root, 'src-tauri/Cargo.toml'));

    const bad = checkVersion(root, '0.3.0');

    expect(bad.map((b) => b.path)).toEqual(['src-tauri/Cargo.toml']);
  });
});
