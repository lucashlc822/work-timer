import { RemoteError, type RemoteStore } from './remote';
import type { SyncTable, WireRow } from './wire';

/** `user_settings` has one row per account and no `id`; the fake has one account. */
const SETTINGS_KEY = 'me';

const keyOf = (table: SyncTable, row: Record<string, unknown>): string =>
  table === 'user_settings' ? SETTINGS_KEY : (row.id as string);

/**
 * An in-memory server with the real one's rules, for tests: insert-only
 * sessions and constellations (duplicate ids ignored), newest-`updated_at`-wins
 * tags and settings, whole batches refused atomically, and a server-stamped,
 * strictly increasing `server_updated_at`. Knobs simulate going offline, being
 * signed out, rows the server refuses, and a required minimum app version.
 */
export class FakeRemote implements RemoteStore {
  readonly tables: Record<SyncTable, Map<string, WireRow>> = {
    tags: new Map(),
    constellations: new Map(),
    sessions: new Map(),
    ledger: new Map(),
    user_settings: new Map(),
  };

  signedIn = true;
  offline = false;
  /** What `app_config.min_client_version` holds. */
  minVersion: string | null = null;
  /** Ids whose content the server refuses (like a failed check constraint). */
  readonly reject = new Set<string>();
  /** Ids refused for now only (like a session "from the future"). */
  readonly retryLater = new Set<string>();
  /** Runs before each push is applied — lets a test edit the local store mid-upload. */
  onPush: ((table: SyncTable, rows: readonly Record<string, unknown>[]) => Promise<void>) | null =
    null;
  /** Runs before each pull returns — lets a test hold a round in its download step. */
  onPull: ((table: SyncTable) => Promise<void>) | null = null;
  hasSessionCalls = 0;
  pushCalls = 0;
  pullCalls = 0;
  private readonly listeners = new Set<() => void>();

  private clock = Date.parse('2026-10-09T00:00:00.000Z');

  private stamp(): string {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }

  /** Put a row on the server directly, as if another device had uploaded it. */
  seed(table: SyncTable, row: Record<string, unknown>): void {
    this.tables[table].set(keyOf(table, row), { ...row, server_updated_at: this.stamp() });
  }

  /** Tell subscribers something changed, as the real server's live updates would. */
  emitChange(): void {
    for (const listener of this.listeners) listener();
  }

  hasSession(): Promise<boolean> {
    this.hasSessionCalls += 1;
    return Promise.resolve(this.signedIn);
  }

  async push(table: SyncTable, rows: readonly Record<string, unknown>[]): Promise<void> {
    if (this.offline) throw new RemoteError('network', 'offline');
    this.pushCalls += 1;
    await this.onPush?.(table, rows);
    if (rows.some((r) => this.reject.has(keyOf(table, r)))) {
      throw new RemoteError('rejected', 'new row violates check constraint');
    }
    if (rows.some((r) => this.retryLater.has(keyOf(table, r)))) {
      throw new RemoteError(
        'retryLater',
        'violates check constraint "session_not_from_the_future"',
      );
    }
    const store = this.tables[table];
    for (const row of rows) {
      const key = keyOf(table, row);
      const existing = store.get(key);
      if (table === 'tags' || table === 'user_settings') {
        if (
          existing === undefined ||
          Date.parse(row.updated_at as string) > Date.parse(existing.updated_at as string)
        ) {
          store.set(key, { ...row, server_updated_at: this.stamp() });
        }
      } else if (existing === undefined) {
        store.set(key, { ...row, server_updated_at: this.stamp() });
      }
    }
  }

  async pull(table: SyncTable, since: string | null, limit: number): Promise<WireRow[]> {
    if (this.offline) throw new RemoteError('network', 'offline');
    this.pullCalls += 1;
    await this.onPull?.(table);
    if (this.offline) throw new RemoteError('network', 'offline');
    const rows = [...this.tables[table].values()]
      .filter((r) => since === null || Date.parse(r.server_updated_at) > Date.parse(since))
      .sort((a, b) => Date.parse(a.server_updated_at) - Date.parse(b.server_updated_at))
      .slice(0, limit);
    return rows;
  }

  subscribe(_userId: string, onChange: () => void): () => void {
    this.listeners.add(onChange);
    return () => this.listeners.delete(onChange);
  }

  minClientVersion(): Promise<string | null> {
    if (this.offline) return Promise.reject(new RemoteError('network', 'offline'));
    return Promise.resolve(this.minVersion);
  }
}
