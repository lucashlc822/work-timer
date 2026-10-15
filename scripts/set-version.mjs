// The app's version lives in five files that must agree: the web package, its
// lockfile, the Tauri config, and the Rust crate with its lockfile. This sets
// them together, or checks that they already say what a release tag says.
//
//   npm run version:set -- 0.2.0
//   node scripts/set-version.mjs --check v0.2.0     (used by the release workflow)
//
// Rewrites the text in place rather than parsing and re-printing the JSON, so a
// version bump touches exactly one line per file and nothing else.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const STRICT = /^\d+\.\d+\.\d+$/;
const EOL = '\\r?\\n';

/**
 * Each file's version is one match of `pattern`; group 1 is everything before
 * the version and group 3 everything after, so replacing is `$1<new>$3`.
 */
const FILES = [
  {
    path: 'package.json',
    pattern: /^(\s*"version":\s*")([^"]*)(")/m,
  },
  {
    // The lockfile states the version twice: at the top, and for the root
    // package under `packages[""]`.
    path: 'package-lock.json',
    pattern: new RegExp(
      `^(\\{${EOL}\\s*"name":\\s*"work-timer",${EOL}\\s*"version":\\s*")([^"]*)(")`,
    ),
    also: new RegExp(
      `("packages":\\s*\\{${EOL}\\s*"":\\s*\\{${EOL}\\s*"name":\\s*"work-timer",${EOL}\\s*"version":\\s*")([^"]*)(")`,
    ),
  },
  {
    path: 'src-tauri/tauri.conf.json',
    pattern: /^(\s*"version":\s*")([^"]*)(")/m,
  },
  {
    path: 'src-tauri/Cargo.toml',
    pattern: /^(version\s*=\s*")([^"]*)(")/m,
  },
  {
    path: 'src-tauri/Cargo.lock',
    pattern: new RegExp(`(\\[\\[package\\]\\]${EOL}name = "starkeep"${EOL}version = ")([^"]*)(")`),
  },
];

const patternsOf = (file) => [file.pattern, ...(file.also ? [file.also] : [])];

/** The version each file currently states. A file with no match is reported, not guessed. */
export const readVersions = (root) =>
  FILES.map((file) => {
    const text = readFileSync(resolve(root, file.path), 'utf8');
    const versions = patternsOf(file).map((re) => re.exec(text)?.[2] ?? null);
    return { path: file.path, versions };
  });

/** Normalises `v1.2.3` (a tag) and `1.2.3` to `1.2.3`, or throws. */
export const parseVersion = (input) => {
  const version = input.startsWith('v') ? input.slice(1) : input;
  if (!STRICT.test(version)) {
    throw new Error(`"${input}" is not a version like 1.2.3`);
  }
  return version;
};

/** Rewrite all five files to `version` (strict `x.y.z`, no leading `v`). */
export const setVersion = (root, version) => {
  if (!STRICT.test(version)) throw new Error(`"${version}" is not a version like 1.2.3`);

  // Check every file first, so a missing pattern can't leave a half-bumped tree.
  const updates = FILES.map((file) => {
    let text = readFileSync(resolve(root, file.path), 'utf8');
    for (const re of patternsOf(file)) {
      if (!re.test(text)) throw new Error(`No version found in ${file.path}`);
      text = text.replace(re, `$1${version}$3`);
    }
    return { file, text };
  });
  for (const { file, text } of updates) writeFileSync(resolve(root, file.path), text);
};

/** Files whose version differs from `version`, as `{ path, found }` (empty = all agree). */
export const checkVersion = (root, version) =>
  readVersions(root).flatMap(({ path, versions }) =>
    versions.filter((found) => found !== version).map((found) => ({ path, found })),
  );

const main = () => {
  const [flag, value] = process.argv.slice(2);
  const root = process.cwd();

  try {
    if (flag === '--check') {
      const version = parseVersion(value ?? '');
      const bad = checkVersion(root, version);
      if (bad.length > 0) {
        for (const { path, found } of bad) {
          console.error(`${path} says ${found ?? '(nothing found)'}, expected ${version}`);
        }
        process.exit(1);
      }
      console.log(`All five files say ${version}`);
      return;
    }

    if (flag === undefined || flag.startsWith('-')) {
      console.error(
        'Usage: npm run version:set -- X.Y.Z\n       node scripts/set-version.mjs --check vX.Y.Z',
      );
      process.exit(2);
    }

    const version = parseVersion(flag);
    if (flag.startsWith('v')) {
      throw new Error(`Write the version without the "v": ${version}`);
    }
    setVersion(root, version);
    console.log(
      `Set ${version} in package.json, package-lock.json, tauri.conf.json, Cargo.toml, Cargo.lock`,
    );
    console.log('Next: open a PR, merge it, then tag v' + version + ' on master.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
};

// Only when run as a script, not when a test imports the functions above.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
