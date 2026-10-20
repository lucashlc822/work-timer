#!/usr/bin/env node
// Asks the hosted Supabase project one real question, so the free tier doesn't
// pause it for inactivity (it does after about 7 quiet days).
//
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_PUBLISHABLE_KEY=sb_publishable_... \
//   node scripts/keep-alive.mjs
//
// It reads `public.app_config`, which anyone may read (the app reads it the
// same way), using only the public publishable key, so there is nothing secret
// here. `.github/workflows/keep-alive.yml` runs it on a schedule; exit code 1
// means the server did not answer properly.

const url = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? '';

const HINT =
  'Is the project paused (restore it from the Supabase dashboard)? Did its ' +
  'URL or publishable key change (update the VITE_SUPABASE_* repository variables)?';

const fail = (message) => {
  console.error(`Keep-alive failed: ${message}`);
  process.exitCode = 1;
};

const run = async () => {
  for (const [name, value] of [
    ['SUPABASE_URL', url],
    ['SUPABASE_PUBLISHABLE_KEY', key],
  ]) {
    if (!value) {
      fail(`${name} is not set. See .env.example and .github/workflows/keep-alive.yml.`);
      return;
    }
  }

  let response;
  try {
    response = await fetch(`${url}/rest/v1/app_config?select=min_client_version`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    fail(`could not reach ${url} (${error instanceof Error ? error.message : error}). ${HINT}`);
    return;
  }

  const text = await response.text();
  let rows = null;
  try {
    rows = JSON.parse(text);
  } catch {
    // Not JSON: handled below.
  }

  // One row with that column proves PostgREST really queried Postgres; a
  // paused project or a wrong key gives a non-200, a web page, or no rows.
  const answered =
    response.ok &&
    Array.isArray(rows) &&
    rows.length === 1 &&
    rows[0] !== null &&
    typeof rows[0] === 'object' &&
    'min_client_version' in rows[0];
  if (!answered) {
    fail(`HTTP ${response.status}, body: ${text.slice(0, 300)}. ${HINT}`);
    return;
  }

  console.log(`Supabase answered: min_client_version = ${rows[0].min_client_version}`);
};

await run();
