import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

import type { SessionRow } from '../db';
import { RemoteError, type RemoteStore } from './remote';
import { supabaseRemote } from './supabaseRemote';
import { sessionToWire, tagToWire } from './wire';

/**
 * The real adapter against the local Supabase stack — the one place the
 * error sorting is checked against what Postgres actually returns.
 *
 * Off by default (CI and fresh clones have no stack). To run:
 *   npx supabase start
 *   npm run invite -- add a@test.local --local     (and sign up once in the app)
 *   SUPABASE_IT=1 SUPABASE_IT_KEY=<publishable key> npx vitest run supabaseRemote.integration
 *
 * Uses the local test account from supabase/README.md.
 */

const enabled = process.env.SUPABASE_IT === '1';
const url = process.env.SUPABASE_IT_URL ?? 'http://127.0.0.1:54321';
const key = process.env.SUPABASE_IT_KEY ?? '';

const T0 = Date.now() - 3_600_000;
const session = (o: Partial<SessionRow> = {}): SessionRow => ({
  id: crypto.randomUUID(),
  mode: 'countdown',
  plannedDurationS: 60,
  actualFocusS: 60,
  startedAt: T0,
  endedAt: T0 + 60_000,
  outcome: 'completed',
  awayMs: 0,
  tagId: null,
  seed: 'it-seed',
  device: 'integration-test',
  clientCreatedAt: T0,
  syncedAt: null,
  ...o,
});

describe.skipIf(!enabled)('supabaseRemote against the local stack', () => {
  // Built in beforeAll, not at collection time: a skipped suite's body still
  // runs while tests are collected, and createClient throws without a key.
  let remote: RemoteStore;

  beforeAll(async () => {
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await client.auth.signInWithPassword({
      email: 'a@test.local',
      password: 'local-test-pass-1',
    });
    if (error) throw error;
    remote = supabaseRemote(client);
  });

  it('uploads a session once, however often it is sent', async () => {
    const s = session();
    await remote.push('sessions', [sessionToWire(s)]);
    await remote.push('sessions', [sessionToWire({ ...s, actualFocusS: 1 })]);

    const rows = await remote.pull('sessions', null, 1000);
    const mine = rows.filter((r) => r.id === s.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.actual_focus_s).toBe(60);
  });

  it('keeps the newest tag edit', async () => {
    const id = crypto.randomUUID();
    const base = {
      id,
      name: 'IT tag',
      color: 'mint' as const,
      createdAt: T0,
      archivedAt: null,
      syncedAt: null,
    };
    await remote.push('tags', [tagToWire({ ...base, updatedAt: T0 + 2000, name: 'Newer' })]);
    await remote.push('tags', [tagToWire({ ...base, updatedAt: T0 + 1000, name: 'Older' })]);

    const rows = await remote.pull('tags', null, 1000);
    expect(rows.find((r) => r.id === id)?.name).toBe('Newer');
  });

  it('reports a refused row as "rejected", not as a network problem', async () => {
    const bad = session({ actualFocusS: 99_999 }); // more focus than the session spanned
    await expect(remote.push('sessions', [sessionToWire(bad)])).rejects.toMatchObject({
      kind: 'rejected',
    });
  });

  it('reports a session "from the future" as retry-later', async () => {
    const future = session({ startedAt: Date.now() + 3_600_000, endedAt: Date.now() + 3_660_000 });
    const error = await remote.push('sessions', [sessionToWire(future)]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RemoteError);
    expect((error as RemoteError).kind).toBe('retryLater');
  });

  it('pages by server time', async () => {
    const all = await remote.pull('sessions', null, 1000);
    const last = all[all.length - 1]!.server_updated_at;
    expect(await remote.pull('sessions', last, 1000)).toEqual([]);
  });
});
