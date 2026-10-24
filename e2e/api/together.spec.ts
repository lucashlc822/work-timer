import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

import { befriend, setName } from '../support/friends';
import { localStack } from '../support/localStack';
import { listen } from '../support/realtime';
import { createUser, newId, signedInClient } from '../support/users';

/**
 * M7 phase 4 over the real API: each member of a room hears every change to
 * it on a live channel filtered to their own user id, and nobody else hears
 * anything. That is the whole mechanism by which a start or a cancel reaches
 * the other devices within seconds. The database suite
 * (supabase/tests/m7_together.test.sql) covers the rules themselves.
 */

const rpc = async <T>(
  client: SupabaseClient,
  fn: string,
  args?: Record<string, unknown>,
): Promise<T> => {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
};

const MEMBERS = ['together_members'] as const;

test('members hear every change to their room; nobody else hears anything', async () => {
  const ada = await createUser('tg-ada');
  const bea = await createUser('tg-bea');
  const cy = await createUser('tg-cy'); // a stranger to both
  await setName(ada, 'Ada');
  await setName(bea, 'Bea');
  await befriend(ada, bea);

  const adaClient = await signedInClient(ada);
  const beaClient = await signedInClient(bea);
  const cyClient = await signedInClient(cy);

  const heardByAda: string[] = [];
  const heardByBea: string[] = [];
  const heardByCy: string[] = [];
  const channels = [
    await listen(adaClient, `together:${ada.id}`, MEMBERS, `user_id=eq.${ada.id}`, heardByAda),
    await listen(beaClient, `together:${bea.id}`, MEMBERS, `user_id=eq.${bea.id}`, heardByBea),
    // Cy names Bea's id, and also listens to everything: neither may hear a thing.
    await listen(cyClient, `spy:${cy.id}`, MEMBERS, `user_id=eq.${bea.id}`, heardByCy),
    await listen(cyClient, `spy-all:${cy.id}`, MEMBERS, undefined, heardByCy),
  ];

  try {
    // The invitation reaches Bea.
    const room = await rpc<string>(adaClient, 'create_room', {
      friends: [bea.id],
      planned_duration_s: 60,
    });
    await expect.poll(() => heardByBea.length, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);

    // Joining, starting and a cancel each reach both members.
    const heard = () => [heardByAda.length, heardByBea.length] as const;
    let [aBefore, bBefore] = heard();
    await rpc(beaClient, 'respond_room', { room, join_room: true });
    await expect.poll(() => heardByAda.length, { timeout: 15_000 }).toBeGreaterThan(aBefore);
    await expect.poll(() => heardByBea.length, { timeout: 15_000 }).toBeGreaterThan(bBefore);

    [aBefore, bBefore] = heard();
    await rpc(adaClient, 'start_room', { room });
    await expect.poll(() => heardByBea.length, { timeout: 15_000 }).toBeGreaterThan(bBefore);
    const beaView = await rpc<{ id: string; status: string; ends_at: string }[]>(
      beaClient,
      'my_rooms',
    );
    expect(beaView.find((r) => r.id === room)?.status).toBe('running');

    [aBefore, bBefore] = heard();
    await rpc(beaClient, 'cancel_room', { room });
    await expect.poll(() => heardByAda.length, { timeout: 15_000 }).toBeGreaterThan(aBefore);
    const adaView = await rpc<{ id: string; status: string; cancelled_by: string }[]>(
      adaClient,
      'my_rooms',
    );
    expect(adaView.find((r) => r.id === room)).toMatchObject({
      status: 'cancelled',
      cancelled_by: bea.id,
    });

    // Give Cy's channels the same time again and more, and require silence.
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    expect(heardByCy).toEqual([]);
    expect(await rpc<unknown[]>(cyClient, 'my_rooms')).toEqual([]);
  } finally {
    for (const channel of channels) await channel.unsubscribe();
    for (const c of [adaClient, beaClient, cyClient]) await c.removeAllChannels();
  }
});

test('a signed-out client can call none of the together functions', async () => {
  const stack = localStack();
  const anon = createClient(stack.url, stack.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const room = newId();
  const calls: [string, Record<string, unknown> | undefined][] = [
    ['create_room', { friends: [newId()], planned_duration_s: 60 }],
    ['respond_room', { room, join_room: true }],
    ['start_room', { room }],
    ['leave_room', { room }],
    ['cancel_room', { room }],
    ['my_rooms', undefined],
    ['together_wins', undefined],
  ];
  for (const [fn, args] of calls) {
    const { error } = await anon.rpc(fn, args);
    expect(error?.code, fn).toBe('42501');
  }
  const { error } = await anon.from('together_members').select('*');
  expect(error?.code).toBe('42501');
});
