/**
 * Local database — the app's source of truth.
 *
 * IndexedDB is authoritative; the server (from M5 onward) is a replica that
 * happens to live somewhere else. That ordering is what lets the app start a
 * session with no network, no account, and no cold-start latency.
 *
 * ## Row types are a storage contract
 *
 * The `*Row` types below describe what is *persisted*. Features build richer
 * domain types on top of them. Keeping the storage shape here — rather than
 * importing a feature's domain type into `shared/` — stops the dependency
 * arrow from pointing the wrong way.
 *
 * ## Versioning
 *
 * Each milestone that needs new tables or fields adds a new `db.version(n)`
 * block below and leaves the earlier ones untouched. Dexie replays them in
 * order for users on older schemas. Never edit a shipped version in place.
 */

import Dexie, { type EntityTable } from 'dexie';

export type SessionMode = 'countdown' | 'pomodoro';

/**
 * How a session ended.
 *
 * - `completed` — ran to the planned duration. Earns a star.
 * - `cancelled` — the user deliberately stopped it.
 *
 * There is deliberately no `abandoned` outcome. Leaving the app, closing the
 * window, or locking the machine never forfeits a session — the timer runs on
 * wall-clock time regardless. Giving up is an explicit act, so there is only
 * one way to fail and it is always the user's own choice.
 */
export type SessionOutcome = 'completed' | 'cancelled';

export interface SessionRow {
  /** Client-generated UUID. Stable from creation, so sync replay is idempotent. */
  id: string;
  mode: SessionMode;
  plannedDurationS: number;
  /** Focused seconds actually credited. Diverges from planned on early endings. */
  actualFocusS: number;
  /** Epoch ms. Elapsed time is always derived from this, never from tick counts. */
  startedAt: number;
  /** Epoch ms, or null while the session is still in flight. */
  endedAt: number | null;
  /** Null while in flight. */
  outcome: SessionOutcome | null;
  /**
   * Total ms spent with the app hidden or unfocused.
   *
   * Purely informational — it never affects whether a session succeeds. Kept
   * so the M4 stats can say something honest about how a session went without
   * ever being punitive about it.
   */
  awayMs: number;
  tagId: string | null;
  /** Deterministic input to the star generator. The star is the seed, not an image. */
  seed: string;
  /** Coarse device label, e.g. `mobile/installed`. */
  device: string;
  clientCreatedAt: number;
  /** Epoch ms of last successful upload; null means the outbox still owns it. */
  syncedAt: number | null;
}

/**
 * Small key/value store for singletons that do not deserve a table.
 *
 * Notably holds `activeSessionId`. An in-flight session could in principle be
 * found by querying for `endedAt === null`, but IndexedDB will not index null
 * values, so that query would require a full scan. An explicit pointer is both
 * faster and clearer about intent.
 */
export interface MetaRow {
  key: string;
  value: unknown;
}

export const META_KEYS = {
  /** Id of the session currently running, or absent when idle. */
  activeSessionId: 'activeSessionId',
  /** Schema-independent install identity, used before an account exists. */
  localUserId: 'localUserId',
} as const;

export type WorkTimerDb = Dexie & {
  sessions: EntityTable<SessionRow, 'id'>;
  meta: EntityTable<MetaRow, 'key'>;
};

export const DB_NAME = 'work-timer';

export const createDb = (name: string = DB_NAME): WorkTimerDb => {
  const db = new Dexie(name) as WorkTimerDb;

  // v1 (M0) — sessions and the meta store.
  //
  // Indexed: startedAt for chronological history and streak queries, tagId for
  // per-tag stats, syncedAt so the outbox can find unsynced rows cheaply.
  // `outcome` is deliberately not indexed: it is null for exactly one row at a
  // time and low-cardinality otherwise, so an index would not pay for itself.
  db.version(1).stores({
    sessions: 'id, startedAt, tagId, syncedAt',
    meta: 'key',
  });

  return db;
};

export const db = createDb();
