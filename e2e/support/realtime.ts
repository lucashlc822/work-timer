import {
  REALTIME_SUBSCRIBE_STATES,
  type RealtimeChannel,
  type SupabaseClient,
} from '@supabase/supabase-js';

/**
 * Listens for live updates the way the app does, and resolves only once the
 * channel is really listening. Each change heard is pushed onto `events` as
 * "table:EVENT".
 *
 * Ready means both "subscribed" and the server's own confirmation that it is
 * now listening to Postgres for this channel, which can arrive later. A change
 * made in between is never delivered, which would make a control fail and a
 * silence meaningless.
 */
export const listen = async (
  client: SupabaseClient,
  name: string,
  tables: readonly string[],
  filter: string | undefined,
  events: string[],
): Promise<RealtimeChannel> => {
  const channel = client.channel(name);
  for (const table of tables) {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table, ...(filter !== undefined ? { filter } : {}) },
      (payload) => events.push(`${payload.table}:${payload.eventType}`),
    );
  }
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
