import { RemoteError, type RemoteStore } from './remote';
import type { SyncTable, WireRow } from './wire';

/**
 * An in-memory server with the real one's rules, for tests: insert-only
 * sessions and constellations (duplicate ids ignored), newest-`updated_at`-wins
 * tags, whole batches refused atomically, and a server-stamped, strictly
 * increasing `server_updated_at`. Knobs simulate going offline, being signed
 * out, and rows the server refuses.
 */
export class FakeRemote implements RemoteStore {
  readonly tables: Record<SyncTable, Map<string, WireRow>> = {
    tags: new Map(),
    constellations: new Map(),
    sessions: new Map(),
  };

  signedIn = true;
  offline = false;
  /** Ids whose content the server refuses (like a failed check constraint). */
  readonly reject = new Set<string>();
  /** Ids refused for now only (like a session "from the future"). */
  readonly retryLater = new Set<string>();
  /** Runs before each push is applied — lets a test edit the local store mid-upload. */
  onPush: ((table: SyncTable, rows: readonly Record<string, unknown>[]) => Promise<void>) | null =
    null;
  hasSessionCalls = 0;
  pushCalls = 0;

  private clock = Date.parse('2026-10-09T00:00:00.000Z');

  private stamp(): string {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }

  /** Put a row on the server directly, as if another device had uploaded it. */
  seed(table: SyncTable, row: Record<string, unknown>): void {
    this.tables[table].set(row.id as string, { ...row, server_updated_at: this.stamp() });
  }

  hasSession(): Promise<boolean> {
    this.hasSessionCalls += 1;
    return Promise.resolve(this.signedIn);
  }

  async push(table: SyncTable, rows: readonly Record<string, unknown>[]): Promise<void> {
    if (this.offline) throw new RemoteError('network', 'offline');
    this.pushCalls += 1;
    await this.onPush?.(table, rows);
    if (rows.some((r) => this.reject.has(r.id as string))) {
      throw new RemoteError('rejected', 'new row violates check constraint');
    }
    if (rows.some((r) => this.retryLater.has(r.id as string))) {
      throw new RemoteError(
        'retryLater',
        'violates check constraint "session_not_from_the_future"',
      );
    }
    const store = this.tables[table];
    for (const row of rows) {
      const existing = store.get(row.id as string);
      if (table === 'tags') {
        if (
          existing === undefined ||
          Date.parse(row.updated_at as string) > Date.parse(existing.updated_at as string)
        ) {
          store.set(row.id as string, { ...row, server_updated_at: this.stamp() });
        }
      } else if (existing === undefined) {
        store.set(row.id as string, { ...row, server_updated_at: this.stamp() });
      }
    }
  }

  pull(table: SyncTable, since: string | null, limit: number): Promise<WireRow[]> {
    if (this.offline) return Promise.reject(new RemoteError('network', 'offline'));
    const rows = [...this.tables[table].values()]
      .filter((r) => since === null || Date.parse(r.server_updated_at) > Date.parse(since))
      .sort((a, b) => Date.parse(a.server_updated_at) - Date.parse(b.server_updated_at))
      .slice(0, limit);
    return Promise.resolve(rows);
  }
}
