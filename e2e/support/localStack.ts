import { execSync } from 'node:child_process';

/**
 * The local Supabase stack's addresses and keys, and the fence that keeps the
 * end-to-end tests off the hosted project.
 *
 * Everything comes from `npx supabase status -o env`, which describes only the
 * stack running on this machine (or the CI runner). Nothing here reads
 * `.env.*.local`: `.env.production.local` points at the hosted project and
 * `.env.admin.local` holds its secret key, and neither may ever reach a test.
 *
 * The values are cached in `process.env` (E2E_SUPABASE_*) so Playwright's
 * worker processes inherit them instead of running the CLI again. Setting
 * E2E_SUPABASE_URL yourself overrides the URL, and it is still checked: that
 * is how the fence itself is tested.
 */

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

/** Returns `raw` if it points at this machine; throws before anything is sent otherwise. */
export const assertLocal = (name: string, raw: string): string => {
  let host: string;
  try {
    host = new URL(raw).hostname;
  } catch {
    throw new Error(`Refusing to run: ${name} is not a URL (${raw}).`);
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Refusing to run: ${name} is ${raw}, which is not this computer. The end-to-end ` +
        'tests only ever talk to the local Supabase stack (npx supabase start), never the hosted project.',
    );
  }
  return raw;
};

export interface LocalStack {
  /** The API gateway, e.g. http://127.0.0.1:54321 */
  url: string;
  publishableKey: string;
  /** Local stack only: creates test users and invites. Never the hosted project's key. */
  secretKey: string;
  /** Mailpit, where every email the local stack sends lands. */
  inboxUrl: string;
}

const readStatus = (): Record<string, string> => {
  let out: string;
  try {
    out = execSync('npx supabase status -o env', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    throw new Error(
      "The local Supabase stack isn't running. Start Docker Desktop, then `npx supabase start`.",
    );
  }
  const vars: Record<string, string> = {};
  for (const line of out.split(/\r?\n/)) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (match?.[1] !== undefined && match[2] !== undefined) {
      vars[match[1]] = match[2].replace(/^"(.*)"$/, '$1');
    }
  }
  return vars;
};

export const localStack = (): LocalStack => {
  const env = process.env;

  // An explicit URL is checked before anything else runs, so a wrong one stops
  // the run even when the local stack is down.
  if (env.E2E_SUPABASE_URL !== undefined) assertLocal('E2E_SUPABASE_URL', env.E2E_SUPABASE_URL);

  if (
    env.E2E_SUPABASE_URL === undefined ||
    env.E2E_SUPABASE_PUBLISHABLE_KEY === undefined ||
    env.E2E_SUPABASE_SECRET_KEY === undefined ||
    env.E2E_INBOX_URL === undefined
  ) {
    const status = readStatus();
    env.E2E_SUPABASE_URL ??= status.API_URL;
    env.E2E_SUPABASE_PUBLISHABLE_KEY ??= status.PUBLISHABLE_KEY;
    env.E2E_SUPABASE_SECRET_KEY ??= status.SECRET_KEY;
    env.E2E_INBOX_URL ??= status.MAILPIT_URL ?? status.INBUCKET_URL;
  }

  const missing = (
    [
      'E2E_SUPABASE_URL',
      'E2E_SUPABASE_PUBLISHABLE_KEY',
      'E2E_SUPABASE_SECRET_KEY',
      'E2E_INBOX_URL',
    ] as const
  ).filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(`\`npx supabase status -o env\` did not provide ${missing.join(', ')}.`);
  }

  return {
    url: assertLocal('E2E_SUPABASE_URL', env.E2E_SUPABASE_URL!),
    publishableKey: env.E2E_SUPABASE_PUBLISHABLE_KEY!,
    secretKey: env.E2E_SUPABASE_SECRET_KEY!,
    inboxUrl: assertLocal('E2E_INBOX_URL', env.E2E_INBOX_URL!),
  };
};
