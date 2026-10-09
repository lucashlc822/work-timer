import type { SyncTable, WireRow } from './wire';

/**
 * What the sync engine needs from a server. The real one is Supabase
 * (`supabaseRemote`); tests use an in-memory stand-in with the same rules.
 *
 * Server rules the engine relies on (enforced by the migration):
 * - `push` of sessions and constellations is insert-only: an id that already
 *   exists is silently ignored, so re-sending is always safe.
 * - `push` of tags is an upsert where the newest `updated_at` wins; an older
 *   copy arriving late changes nothing.
 * - Every row carries `server_updated_at`, stamped by the server, which `pull`
 *   pages through in order.
 */
export interface RemoteStore {
  /** Whether there is a signed-in session to sync as. Never syncs anonymously. */
  hasSession(): Promise<boolean>;
  push(table: SyncTable, rows: readonly Record<string, unknown>[]): Promise<void>;
  /** Rows with `server_updated_at` after `since` (all if null), oldest first, at most `limit`. */
  pull(table: SyncTable, since: string | null, limit: number): Promise<WireRow[]>;
}

/**
 * Why a server call failed, as far as sync cares:
 *
 * - `network`: no answer (offline, server paused or unreachable). Retry later.
 * - `auth`: the server didn't accept who we are (token expired and not yet
 *   refreshed, signed out elsewhere). Retry later; never treat the rows as bad.
 * - `rejected`: the server refused these rows' *content* (a check or foreign
 *   key failed). Retrying the same row won't help.
 * - `retryLater`: refused for now but valid later — a session the server
 *   thinks ended in the future because this device's clock runs fast.
 * - `server`: anything else. Retry later.
 */
export type RemoteErrorKind = 'network' | 'auth' | 'rejected' | 'retryLater' | 'server';

export class RemoteError extends Error {
  readonly kind: RemoteErrorKind;

  constructor(kind: RemoteErrorKind, message: string) {
    super(message);
    this.kind = kind;
    this.name = 'RemoteError';
  }
}
