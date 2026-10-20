import { expect, test } from '@playwright/test';
import {
  REALTIME_SUBSCRIBE_STATES,
  type RealtimeChannel,
  type SupabaseClient,
} from '@supabase/supabase-js';

import { createUser, newId, signedInClient } from '../support/users';

/**
 * Live updates never cross accounts. The database tests check what is
 * published and that it has row-level security; this checks what a websocket
 * actually receives.
 *
 * B listens the way the app does but names A's user id in the filter, and on
 * a second channel with no filter at all. A makes changes in three tables. B
 * must hear nothing, while A's own channel (the control) hears every change,
 * so B's silence can't be a subscription that simply never worked.
 */

const TABLES = ['tags', 'sessions', 'ledger'] as const;

const listen = async (
  client: SupabaseClient,
  name: string,
  filter: string | undefined,
  events: string[],
): Promise<RealtimeChannel> => {
  const channel = client.channel(name);
  for (const table of TABLES) {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table, ...(filter !== undefined ? { filter } : {}) },
      (payload) => events.push(`${payload.table}:${payload.eventType}`),
    );
  }
  // Ready means both "subscribed" and the server's own confirmation that it is
  // now listening to Postgres for this channel, which can arrive later. A
  // change made in between is never delivered, which would make the control
  // fail and B's silence meaningless.
  await new Promise<void>((resolve, reject) => {
    let subscribed = false;
    let listening = false;
    const settle = () => {
      if (subscribed && listening) resolve();
    };
    channel.on(
      'system',
      {},
      (payload: { extension?: string; status?: string; message?: string }) => {
        if (payload.extension !== 'postgres_changes') return;
        if (payload.status === 'ok') {
          listening = true;
          settle();
        } else reject(new Error(`${name}: ${payload.message ?? 'postgres_changes failed'}`));
      },
    );
    channel.subscribe((status, error) => {
      if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
        subscribed = true;
        settle();
      } else if (
        status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR ||
        status === REALTIME_SUBSCRIBE_STATES.TIMED_OUT
      ) {
        reject(new Error(`${name}: ${status} ${error?.message ?? ''}`));
      }
    });
  });
  return channel;
};

test('B never receives A’s changes over live updates', async () => {
  const a = await createUser('rt-a');
  const b = await createUser('rt-b');
  const aClient = await signedInClient(a);
  const bClient = await signedInClient(b);

  const heardByA: string[] = [];
  const heardByB: string[] = [];
  const channels = [
    await listen(aClient, `control:${a.id}`, `user_id=eq.${a.id}`, heardByA),
    await listen(bClient, `filtered:${b.id}`, `user_id=eq.${a.id}`, heardByB),
    await listen(bClient, `unfiltered:${b.id}`, undefined, heardByB),
  ];

  try {
    const now = new Date();
    const tagId = newId();
    expect(
      (
        await aClient.from('tags').insert({
          id: tagId,
          name: 'Live',
          color: 'mint',
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await aClient.from('sessions').insert({
          id: newId(),
          mode: 'countdown',
          planned_duration_s: 60,
          actual_focus_s: 60,
          started_at: new Date(now.getTime() - 120_000).toISOString(),
          ended_at: new Date(now.getTime() - 60_000).toISOString(),
          outcome: 'completed',
          seed: 'rt',
          device: 'e2e',
          client_created_at: now.toISOString(),
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await aClient.from('ledger').insert({
          id: newId(),
          reason: 'e2e',
          delta: 1,
          ref: 'rt',
          created_at: now.toISOString(),
        })
      ).error,
    ).toBeNull();

    // The control: A hears all three.
    await expect.poll(() => heardByA.length, { timeout: 15_000 }).toBeGreaterThanOrEqual(3);
    expect(new Set(heardByA)).toEqual(new Set(['tags:INSERT', 'sessions:INSERT', 'ledger:INSERT']));

    // Then give B's channels the same time again and more, and require silence.
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    expect(heardByB).toEqual([]);
  } finally {
    for (const channel of channels) await channel.unsubscribe();
    await aClient.removeAllChannels();
    await bClient.removeAllChannels();
  }
});
