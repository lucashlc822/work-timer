import type { EntityTable } from 'dexie';

import { META_KEYS, readMeta, writeMeta, type WorkTimerDb } from '../db';
import type { Clock } from '../lib';
import { RemoteError, type RemoteErrorKind, type RemoteStore } from './remote';
import {
  constellationFromWire,
  constellationToWire,
  sessionFromWire,
  sessionToWire,
  tagFromWire,
  tagToWire,
  type SyncTable,
  type WireRow,
} from './wire';

/**
 * The sync engine: one round of "upload what's new here, then download what's
 * new there", for one account's local store.
 *
 * Upload (the outbox) is every row with `syncedAt === null` — for sessions,
 * only finished ones; a session in progress is never uploaded. Tags go first,
 * because sessions reference them. After the server accepts a batch, each row
 * is marked synced **only if it is still the version that was sent**: a tag
 * renamed while its upload was in flight stays unsynced and goes up next time.
 *
 * Download pages through each table by the server's own `server_updated_at`,
 * re-reading a minute of overlap each time so a row committed slightly late
 * is never missed. Applying is idempotent: finished sessions and constellation
 * choices are added only if absent (never overwritten), and tags take the
 * newer `updatedAt`.
 *
 * One bad row must not block everything else: if the server refuses a batch
 * for its content, the rows are retried one at a time and only the refused
 * ones are set aside (`META_KEYS.syncRejected`).
 */

export const PUSH_BATCH = 200;
export const PULL_PAGE = 500;
export const PULL_OVERLAP_MS = 60_000;

export interface SyncLock {
  /** Run `task` unless another sync holds the lock; resolve `'busy'` if one does. */
  run<T>(task: () => Promise<T>): Promise<T | 'busy'>;
}

/**
 * Across every window and tab of this origin, via the Web Locks API, so the
 * main window and a second browser tab never sync at the same time.
 */
export const webLock = (name = 'work-timer-sync'): SyncLock | null => {
  if (typeof navigator === 'undefined' || navigator.locks === undefined) return null;
  return {
    run: <T>(task: () => Promise<T>) =>
      navigator.locks.request(name, { ifAvailable: true }, (lock) =>
        lock === null ? ('busy' as const) : task(),
      ) as Promise<T | 'busy'>,
  };
};

export interface SyncCounts {
  pushed: number;
  pulled: number;
  /** Pulled rows this app version couldn't represent, left out. */
  skipped: number;
  /** Rows the server refused for their content (cumulative). */
  rejected: number;
}

export type SyncOutcome =
  | { ok: true; counts: SyncCounts }
  | { ok: false; reason: RemoteErrorKind | 'signedOut' | 'busy'; message?: string };

export interface SyncEngine {
  syncNow(): Promise<SyncOutcome>;
}

interface Deps {
  db: WorkTimerDb;
  remote: RemoteStore;
  clock: Clock;
  /** Cross-window lock; null in tests and where Web Locks is missing. */
  lock: SyncLock | null;
}

type Rejected = Partial<Record<SyncTable, string[]>>;
type Cursors = Partial<Record<SyncTable, string>>;

const chunks = <T>(items: readonly T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

const later = (a: string | undefined, b: string): string =>
  a === undefined || Date.parse(b) > Date.parse(a) || (Date.parse(b) === Date.parse(a) && b > a)
    ? b
    : a;

const withOverlap = (cursor: string | undefined): string | null =>
  cursor === undefined ? null : new Date(Date.parse(cursor) - PULL_OVERLAP_MS).toISOString();

export const createSyncEngine = ({ db, remote, clock, lock }: Deps): SyncEngine => {
  type Synced = { id: string; syncedAt: number | null };

  /**
   * Upload `pending` in batches; mark each row synced if it is unchanged.
   * Content refusals fall back to one row at a time.
   */
  const pushTable = async <R extends Synced>(
    table: SyncTable,
    store: EntityTable<R, 'id'>,
    pending: readonly R[],
    toWire: (row: R) => Record<string, unknown>,
    unchanged: (stored: R, sent: R) => boolean,
    rejected: Set<string>,
  ): Promise<number> => {
    let pushed = 0;

    const markSynced = (rows: readonly R[]) =>
      db.transaction('rw', store, async () => {
        const now = clock.now();
        for (const sent of rows) {
          // Dexie can't resolve its key type through the generic row type;
          // every synced table is keyed by its string `id`.
          const key = sent.id as never;
          const stored = await store.get(key);
          if (stored !== undefined && stored.syncedAt === null && unchanged(stored, sent)) {
            await store.update(key, { syncedAt: now } as never);
            pushed += 1;
          }
        }
      });

    for (const batch of chunks(pending, PUSH_BATCH)) {
      try {
        await remote.push(table, batch.map(toWire));
        await markSynced(batch);
      } catch (e) {
        // A batch is refused as a whole, so one bad (or not-yet-valid) row
        // would hold back every other row in it: retry them one at a time.
        if (!(e instanceof RemoteError) || (e.kind !== 'rejected' && e.kind !== 'retryLater')) {
          throw e;
        }
        for (const row of batch) {
          try {
            await remote.push(table, [toWire(row)]);
            await markSynced([row]);
          } catch (single) {
            if (single instanceof RemoteError && single.kind === 'rejected') rejected.add(row.id);
            else if (single instanceof RemoteError && single.kind === 'retryLater') continue;
            else throw single;
          }
        }
      }
    }
    return pushed;
  };

  const pullTable = async <R extends { id: string }>(
    table: SyncTable,
    store: EntityTable<R, 'id'>,
    fromWire: (w: WireRow, syncedAt: number) => R | null,
    apply: (row: R) => Promise<boolean>,
    counts: SyncCounts,
  ): Promise<void> => {
    const cursors = (await readMeta<Cursors>(db, META_KEYS.syncCursors)) ?? {};
    let since = withOverlap(cursors[table]);

    for (;;) {
      const page = await remote.pull(table, since, PULL_PAGE);
      if (page.length === 0) return;

      await db.transaction('rw', store, db.meta, async () => {
        const now = clock.now();
        for (const wire of page) {
          const row = fromWire(wire, now);
          if (row === null) counts.skipped += 1;
          else if (await apply(row)) counts.pulled += 1;
        }
        const stored = (await readMeta<Cursors>(db, META_KEYS.syncCursors)) ?? {};
        stored[table] = later(stored[table], page[page.length - 1]!.server_updated_at);
        await writeMeta(db, META_KEYS.syncCursors, stored);
      });

      if (page.length < PULL_PAGE) return;
      since = page[page.length - 1]!.server_updated_at;
    }
  };

  const round = async (): Promise<SyncOutcome> => {
    if (!(await remote.hasSession())) return { ok: false, reason: 'signedOut' };

    const counts: SyncCounts = { pushed: 0, pulled: 0, skipped: 0, rejected: 0 };
    const stored = (await readMeta<Rejected>(db, META_KEYS.syncRejected)) ?? {};
    const rejectedFor = (table: SyncTable) => new Set(stored[table] ?? []);
    const rejected = {
      tags: rejectedFor('tags'),
      constellations: rejectedFor('constellations'),
      sessions: rejectedFor('sessions'),
    };

    try {
      // --- up: tags first, since sessions reference them ---
      const tags = await db.tags
        .filter((t) => t.syncedAt === null && !rejected.tags.has(t.id))
        .toArray();
      counts.pushed += await pushTable(
        'tags',
        db.tags,
        tags,
        tagToWire,
        (stored, sent) => stored.updatedAt === sent.updatedAt,
        rejected.tags,
      );

      const choices = await db.constellations
        .filter((c) => c.syncedAt === null && !rejected.constellations.has(c.id))
        .toArray();
      counts.pushed += await pushTable(
        'constellations',
        db.constellations,
        choices,
        constellationToWire,
        () => true,
        rejected.constellations,
      );

      const sessions = await db.sessions
        .filter(
          (s) =>
            s.syncedAt === null &&
            s.endedAt !== null &&
            s.outcome !== null &&
            !rejected.sessions.has(s.id),
        )
        .toArray();
      counts.pushed += await pushTable(
        'sessions',
        db.sessions,
        sessions,
        sessionToWire,
        // A finished session never changes; this only guards against a row
        // that somehow lost its ending since it was read.
        (stored) => stored.endedAt !== null,
        rejected.sessions,
      );

      // --- down ---
      await pullTable(
        'tags',
        db.tags,
        tagFromWire,
        async (incoming) => {
          const local = await db.tags.get(incoming.id);
          if (local === undefined || incoming.updatedAt > local.updatedAt) {
            await db.tags.put(incoming);
            return true;
          }
          if (incoming.updatedAt === local.updatedAt && local.syncedAt === null) {
            // The server already has exactly this version.
            await db.tags.update(local.id, { syncedAt: incoming.syncedAt });
          }
          return false; // A newer local edit stays, and is uploaded next round.
        },
        counts,
      );

      await pullTable(
        'constellations',
        db.constellations,
        constellationFromWire,
        async (row) => {
          if ((await db.constellations.get(row.id)) !== undefined) return false;
          await db.constellations.add(row);
          return true;
        },
        counts,
      );

      await pullTable(
        'sessions',
        db.sessions,
        sessionFromWire,
        async (row) => {
          // Never overwrite a local session: finished ones are immutable, and an
          // id the server has can't be one still in progress here.
          if ((await db.sessions.get(row.id)) !== undefined) return false;
          await db.sessions.add(row);
          return true;
        },
        counts,
      );

      await writeMeta(db, META_KEYS.lastSyncedAt, clock.now());
      return { ok: true, counts };
    } catch (e) {
      if (e instanceof RemoteError) return { ok: false, reason: e.kind, message: e.message };
      throw e;
    } finally {
      const asLists: Rejected = {
        tags: [...rejected.tags],
        constellations: [...rejected.constellations],
        sessions: [...rejected.sessions],
      };
      counts.rejected = rejected.tags.size + rejected.constellations.size + rejected.sessions.size;
      await writeMeta(db, META_KEYS.syncRejected, asLists);
    }
  };

  // Single flight within this window; the lock covers other windows and tabs.
  let inFlight: Promise<SyncOutcome> | null = null;

  return {
    syncNow: () => {
      if (inFlight !== null) return inFlight;
      inFlight = (async () => {
        try {
          if (lock === null) return await round();
          const result = await lock.run(round);
          return result === 'busy' ? ({ ok: false, reason: 'busy' } as const) : result;
        } finally {
          inFlight = null;
        }
      })();
      return inFlight;
    },
  };
};

/**
 * How many rows are waiting to be uploaded, for the status line. The same
 * selection as the outbox, minus anything the server has refused.
 */
export const countPending = async (
  db: WorkTimerDb,
): Promise<{ pending: number; rejected: number }> => {
  const refused = (await readMeta<Rejected>(db, META_KEYS.syncRejected)) ?? {};
  const skip = new Set([
    ...(refused.tags ?? []),
    ...(refused.constellations ?? []),
    ...(refused.sessions ?? []),
  ]);
  const unsynced = (row: { id: string; syncedAt: number | null }) =>
    row.syncedAt === null && !skip.has(row.id);
  const pending =
    (await db.tags.filter(unsynced).count()) +
    (await db.constellations.filter(unsynced).count()) +
    (await db.sessions.filter((s) => unsynced(s) && s.endedAt !== null).count());
  return { pending, rejected: skip.size };
};
