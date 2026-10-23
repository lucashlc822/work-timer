import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

import { localStack } from '../support/localStack';
import { createUser, newId, signedInClient } from '../support/users';

/**
 * M7 phase 1 over the real API: the friends functions as the app will call
 * them (supabase-js through PostgREST), not just inside the database. The
 * database suite (supabase/tests/m7_friends.test.sql) covers every rule; this
 * checks that the functions are exposed to signed-in clients, hidden from
 * signed-out ones, and that friendship opens no door into the tables the app
 * syncs.
 */

const SYNCED_TABLES = ['tags', 'constellations', 'sessions', 'user_settings', 'ledger'] as const;

const ownCode = async (client: SupabaseClient): Promise<string> => {
  const { data, error } = await client.from('profiles').select('friend_code').single();
  expect(error).toBeNull();
  return (data as { friend_code: string }).friend_code;
};

const rpc = async <T>(
  client: SupabaseClient,
  fn: string,
  args?: Record<string, unknown>,
): Promise<T> => {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
};

test('two people become friends by code, and one sees the other’s sky', async () => {
  const a = await createUser('fr-a');
  const b = await createUser('fr-b');
  const aClient = await signedInClient(a);
  const bClient = await signedInClient(b);

  // B has focused once.
  const now = Date.now();
  const sessionId = newId();
  expect(
    (
      await bClient.from('sessions').insert({
        id: sessionId,
        mode: 'countdown',
        planned_duration_s: 60,
        actual_focus_s: 60,
        started_at: new Date(now - 120_000).toISOString(),
        ended_at: new Date(now - 60_000).toISOString(),
        outcome: 'completed',
        seed: 'fr',
        device: 'e2e',
        client_created_at: new Date(now).toISOString(),
      })
    ).error,
  ).toBeNull();

  await rpc(aClient, 'set_display_name', { name: 'Ada' });
  await rpc(bClient, 'set_display_name', { name: 'Bea' });

  const code = await ownCode(bClient);
  expect(code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
  // Typed the way the app will show it: "K7Q-2MX", in lower case.
  const typed = `${code.slice(0, 3)}-${code.slice(3)}`.toLowerCase();
  expect(await rpc<string>(aClient, 'request_friend', { code: typed })).toBe('pending');

  const incoming = await rpc<{ friendship_id: string; display_name: string; direction: string }[]>(
    bClient,
    'my_friends',
  );
  expect(incoming).toHaveLength(1);
  expect(incoming[0]).toMatchObject({ display_name: 'Ada', direction: 'incoming' });

  await rpc(bClient, 'respond_friend', { request_id: incoming[0]!.friendship_id, accept: true });

  const sky = await rpc<{ display_name: string; sessions: { id: string }[] }>(
    aClient,
    'friend_sky',
    {
      friend: b.id,
    },
  );
  expect(sky.display_name).toBe('Bea');
  expect(sky.sessions.map((s) => s.id)).toEqual([sessionId]);

  // Friendship opens no table: the same queries the app's sync makes (every
  // row it may see, no user filter) return none of B's rows to A.
  for (const table of SYNCED_TABLES) {
    const { data, error } = await aClient.from(table).select('*');
    expect(error, table).toBeNull();
    expect(
      (data as { user_id: string }[]).filter((row) => row.user_id === b.id),
      `${table} as seen by A`,
    ).toEqual([]);
  }
  const { data: profiles } = await aClient.from('profiles').select('user_id');
  expect((profiles as { user_id: string }[]).map((p) => p.user_id)).toEqual([a.id]);
});

test('a signed-out client can call none of the friends functions', async () => {
  const stack = localStack();
  const anon = createClient(stack.url, stack.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const calls: [string, Record<string, unknown> | undefined][] = [
    ['set_display_name', { name: 'x' }],
    ['request_friend', { code: 'ABCDEF' }],
    ['respond_friend', { request_id: newId(), accept: true }],
    ['remove_friend', { friendship_id: newId() }],
    ['my_friends', undefined],
    ['friend_sky', { friend: newId() }],
  ];
  for (const [fn, args] of calls) {
    const { error } = await anon.rpc(fn, args);
    expect(error?.code, fn).toBe('42501');
  }
  const { error } = await anon.from('profiles').select('*');
  expect(error?.code).toBe('42501');
});
