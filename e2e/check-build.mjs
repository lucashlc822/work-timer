// Runs between `vite build --mode e2e` and `vite preview` (playwright.config.ts).
// A test build must talk to the local stack and nothing else: refuse to serve
// one that contains a hosted Supabase address, or that doesn't contain the
// local one it was given (which would mean the env never reached the build).
//
// "A hosted address" is a full https://<project>.supabase.co (or .in) URL.
// supabase-js itself contains the bare pattern "*.supabase.co", which is not
// an address and must not count.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const expected = process.env.VITE_SUPABASE_URL ?? '';
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(js|html|json|webmanifest)$/.test(name)) files.push(path);
  }
};
// The folder to check: `dist` unless named (used to test this check itself).
walk(process.argv[2] ?? 'dist');

const HOSTED = /https?:\/\/[a-z0-9-]+\.supabase\.(co|in)\b/i;
const hosted = files.filter((path) => HOSTED.test(readFileSync(path, 'utf8')));
const local =
  expected !== '' && files.some((path) => readFileSync(path, 'utf8').includes(expected));

if (hosted.length > 0) {
  console.error(
    `Refusing to serve: the test build contains a hosted Supabase address, in ${hosted.join(', ')}.`,
  );
  process.exit(1);
}
if (!local) {
  console.error(
    `Refusing to serve: the test build doesn't contain the local server (${expected}).`,
  );
  process.exit(1);
}
console.log(`Test build checked: points at ${expected}, no hosted address.`);
