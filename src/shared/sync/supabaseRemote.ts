import { REALTIME_SUBSCRIBE_STATES, type SupabaseClient } from '@supabase/supabase-js';

import { RemoteError, type RemoteErrorKind, type RemoteStore } from './remote';
import type { SyncTable, WireRow } from './wire';

interface PostgrestErrorLike {
  code?: string;
  message?: string;
}

/**
 * Sort a PostgREST failure into what sync should do about it. Postgres error
 * classes 22 (bad data) and 23 (constraint) mean the rows themselves were
 * refused; 42501 and PGRST3xx are about who is asking, not what was sent.
 */
export const classifyPostgrestError = (
  error: PostgrestErrorLike,
  status: number,
): RemoteErrorKind => {
  const code = error.code ?? '';
  const message = error.message ?? '';
  if (status === 0 || (code === '' && /fetch|network|load failed/i.test(message))) return 'network';
  if (status === 401 || code === '42501' || code.startsWith('PGRST3')) return 'auth';
  if (code.startsWith('23') || code.startsWith('22')) {
    return message.includes('session_not_from_the_future') ? 'retryLater' : 'rejected';
  }
  if (status >= 502 && status <= 504) return 'network';
  return 'server';
};

const fail = (error: PostgrestErrorLike, status: number): never => {
  throw new RemoteError(classifyPostgrestError(error, status), error.message ?? 'request failed');
};

/** Network failures can also reject outright instead of resolving with an error. */
const guard = async <T>(run: () => PromiseLike<T>): Promise<T> => {
  try {
    return await run();
  } catch (e) {
    if (e instanceof RemoteError) throw e;
    throw new RemoteError('network', e instanceof Error ? e.message : String(e));
  }
};

/** Every table whose changes another device should hear about. */
const LIVE_TABLES: readonly SyncTable[] = [
  'tags',
  'constellations',
  'sessions',
  'ledger',
  'user_settings',
];

export const supabaseRemote = (client: SupabaseClient): RemoteStore => ({
  hasSession: async () => {
    const { data } = await client.auth.getSession();
    return data.session !== null;
  },

  push: async (table: SyncTable, rows) => {
    if (rows.length === 0) return;
    const { error, status } = await guard(() =>
      table === 'tags'
        ? // Newest edit wins; the server's lww_guard ignores a stale copy.
          client.from('tags').upsert(rows, { onConflict: 'id' })
        : table === 'user_settings'
          ? // One row per account, keyed by the account (filled in by the server).
            client.from('user_settings').upsert(rows, { onConflict: 'user_id' })
          : // Insert-only: an id already on the server is skipped, so retries are safe.
            client.from(table).upsert(rows, { onConflict: 'id', ignoreDuplicates: true }),
    );
    if (error) fail(error, status);
  },

  pull: async (table: SyncTable, since, limit) => {
    const { data, error, status } = await guard(() => {
      let query = client
        .from(table)
        .select('*')
        .order('server_updated_at', { ascending: true })
        .limit(limit);
      if (since !== null) query = query.gt('server_updated_at', since);
      return query;
    });
    if (error) fail(error, status);
    return (data ?? []) as WireRow[];
  },

  /**
   * Supabase Realtime: the server announces each insert or update to this
   * account's rows (row-level security still decides who hears what). The
   * event only says "something changed"; the caller then runs a normal sync,
   * so there is one way server data is applied. After a reconnect, events
   * sent while disconnected are lost, so a re-subscribe counts as a change.
   */
  subscribe: (userId, onChange) => {
    const channel = client.channel(`sync:${userId}`);
    for (const table of LIVE_TABLES) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` },
        () => onChange(),
      );
    }
    let subscribedBefore = false;
    channel.subscribe((status) => {
      if (status !== REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) return;
      if (subscribedBefore) onChange();
      subscribedBefore = true;
    });
    return () => void client.removeChannel(channel);
  },

  minClientVersion: async () => {
    const { data, error, status } = await guard(() =>
      client.from('app_config').select('min_client_version').maybeSingle(),
    );
    if (error) fail(error, status);
    const min: unknown = data?.min_client_version;
    return typeof min === 'string' && min.trim() !== '' ? min : null;
  },
});
