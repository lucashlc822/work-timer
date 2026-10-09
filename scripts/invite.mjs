#!/usr/bin/env node
// Manage who may create an account.
//
//   npm run invite -- add friend@example.com ["note"]
//   npm run invite -- remove friend@example.com
//   npm run invite -- list
//
// Add --local to act on the local Supabase stack (`npx supabase start`)
// instead of the hosted project.
//
// The hosted project needs its URL and *secret* (service-role) key in
// `.env.admin.local`, which is gitignored:
//
//   SUPABASE_URL=https://<project-ref>.supabase.co
//   SUPABASE_SECRET_KEY=sb_secret_...
//
// That key bypasses row-level security. It must never be given a VITE_ prefix
// or appear in any build: it lives only on the machine of the person who runs
// the server.

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const local = args.includes('--local');
const [command, email, note] = args.filter((a) => a !== '--local');

const usage = () => {
  console.error('Usage: npm run invite -- <add|remove|list> [email] ["note"] [--local]');
  process.exit(1);
};

const readEnvFile = (path) => {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const at = line.indexOf('=');
        return [
          line.slice(0, at).trim(),
          line
            .slice(at + 1)
            .trim()
            .replace(/^["']|["']$/g, ''),
        ];
      }),
  );
};

const connection = () => {
  if (local) {
    const status = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8' }));
    return {
      url: status.API_URL,
      key: status.SECRET_KEY ?? status.SERVICE_ROLE_KEY,
      where: 'local stack',
    };
  }
  const env = { ...readEnvFile(resolve(process.cwd(), '.env.admin.local')), ...process.env };
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
    console.error(
      'Missing SUPABASE_URL or SUPABASE_SECRET_KEY. Put them in .env.admin.local, or use --local.',
    );
    process.exit(1);
  }
  return { url: env.SUPABASE_URL, key: env.SUPABASE_SECRET_KEY, where: env.SUPABASE_URL };
};

if (!['add', 'remove', 'list'].includes(command ?? '')) usage();
if (command !== 'list' && !email) usage();

const { url, key, where } = connection();
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const address = email?.trim().toLowerCase();

if (command === 'add') {
  const { error } = await supabase.from('invites').upsert({ email: address, note: note ?? null });
  if (error) throw new Error(error.message);
  console.log(`Invited ${address} (${where}).`);
} else if (command === 'remove') {
  const { error } = await supabase.from('invites').delete().eq('email', address);
  if (error) throw new Error(error.message);
  console.log(`Removed the invite for ${address} (${where}). An existing account is not deleted.`);
} else {
  const { data, error } = await supabase
    .from('invites')
    .select('email, invited_at, note')
    .order('invited_at');
  if (error) throw new Error(error.message);
  if (data.length === 0) console.log(`No invites (${where}).`);
  for (const row of data)
    console.log(`${row.email}\t${row.invited_at.slice(0, 10)}\t${row.note ?? ''}`);
}
