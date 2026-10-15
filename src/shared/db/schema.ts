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
  /**
   * Pomodoro only (M3): the run this focus block belongs to. Absent on
   * countdown sessions and on every row written before M3 — optional rather
   * than nullable so that no completed row ever has to be rewritten, and
   * unindexed so it needs no schema version.
   */
  runId?: string;
  /** Pomodoro only: 1-based position of this block in its run. */
  runIndex?: number;
}

/**
 * Pomodoro lengths (M3). All durations in seconds.
 *
 * Stored twice: once as the user's saved preference, and once as a snapshot on
 * each run, so editing the preference never changes a run already under way.
 */
export interface PomodoroSettingsRow {
  focusS: number;
  shortBreakS: number;
  longBreakS: number;
  /** A long break follows every Nth completed block. */
  blocksPerLongBreak: number;
}

export interface RunBreakRow {
  kind: 'short' | 'long';
  /** Epoch ms — the planned end of the block before it, not when it was noticed. */
  startedAt: number;
  durationS: number;
}

/**
 * The Pomodoro run in flight, held in `meta` under `activeRun` (M3).
 *
 * Not history: the run's blocks are ordinary `SessionRow`s carrying its id,
 * and this row is deleted when the run ends. It exists only so a break —
 * which is not a session — survives a reload. Whether a break is over is
 * derived from `break.startedAt + durationS`, never stored.
 */
export interface PomodoroRunRow {
  id: string;
  startedAt: number;
  settings: PomodoroSettingsRow;
  /** Completed blocks so far. A cancelled block ends the run instead. */
  blocksDone: number;
  /** The break after the last completed block, or null while a block is running. */
  break: RunBreakRow | null;
  /**
   * The tag every block of this run carries (M4). Optional because runs
   * written by M3 lack it; absent reads as no tag. Held here, not only on the
   * block, so the next block still knows it after a reload during a break.
   */
  tagId?: string | null;
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

export type ConstellationTier = 'easy' | 'medium' | 'hard';

/**
 * The user's choice to start building a constellation (M2).
 *
 * Append-only, like sessions: which stars belong to which constellation, and
 * whether it is finished, are derived from sessions and these rows by the sky
 * feature rather than stored. A choice is never edited — switching to another
 * constellation is a new row.
 */
export interface ConstellationRow {
  /** Client-generated UUID. */
  id: string;
  source: 'catalogue' | 'generated';
  /** Catalogue key when `source` is `catalogue`. Keys are permanent. */
  shapeId: string | null;
  /** Generator seed when `source` is `generated`. */
  seed: string | null;
  tier: ConstellationTier;
  /** Epoch ms. Sessions ending at or after this, before the next choice, belong to it. */
  chosenAt: number;
  clientCreatedAt: number;
  syncedAt: number | null;
}

/** Palette keys, not hex values — the colours themselves live in tokens.css. */
export type TagColor = 'lavender' | 'mint' | 'rose' | 'gold' | 'sky' | 'peach';

/**
 * A label for sessions (M4).
 *
 * Unlike sessions, tags are mutable: they can be renamed, recoloured and
 * archived. Archiving is a soft delete, so old sessions keep their label.
 * `updatedAt` exists so M5 can sync tags last-write-wins.
 */
export interface TagRow {
  /** Client-generated UUID. */
  id: string;
  name: string;
  color: TagColor;
  createdAt: number;
  /** Bumped on rename, recolour and (un)archive. */
  updatedAt: number;
  /** Epoch ms, or null while the tag is active. */
  archivedAt: number | null;
  syncedAt: number | null;
}

export const META_KEYS = {
  /** Id of the session currently running, or absent when idle. */
  activeSessionId: 'activeSessionId',
  /** Schema-independent install identity, used before an account exists. */
  localUserId: 'localUserId',
  /** The Pomodoro run in flight (`PomodoroRunRow`), or absent. */
  activeRun: 'activeRun',
  /** The mode last chosen on the idle screen. */
  timerMode: 'timerMode',
  /** The user's saved `PomodoroSettingsRow`. */
  pomodoroSettings: 'pomodoroSettings',
  /** The tag last chosen on the idle screen (M4), or absent. */
  lastTagId: 'lastTagId',
  /**
   * Sync (M5): per table, the newest `server_updated_at` already pulled
   * (`Partial<Record<table, string>>`). Server time, never this device's clock.
   */
  syncCursors: 'syncCursors',
  /** Sync (M5): epoch ms of the last sync that finished without an error. */
  lastSyncedAt: 'lastSyncedAt',
  /**
   * Sync (M5): ids the server refused for their content, per table
   * (`Partial<Record<table, string[]>>`). Skipped by later pushes so one bad
   * row can't block the rest; shown to the person as "couldn't be backed up".
   */
  syncRejected: 'syncRejected',
  /**
   * Sync (M5): epoch ms of the last change to `timerMode` or `pomodoroSettings`
   * on this device, or of the server copy it adopted. Absent until either
   * happens. Never bumped by `lastTagId`, which stays per device.
   */
  settingsUpdatedAt: 'settingsUpdatedAt',
  /**
   * Sync (M5): the `settingsUpdatedAt` value the server is known to hold. The
   * settings wait to be uploaded whenever the two differ.
   */
  settingsSyncedAt: 'settingsSyncedAt',
} as const;

export type WorkTimerDb = Dexie & {
  sessions: EntityTable<SessionRow, 'id'>;
  meta: EntityTable<MetaRow, 'key'>;
  constellations: EntityTable<ConstellationRow, 'id'>;
  tags: EntityTable<TagRow, 'id'>;
};

/**
 * The single store every build used before accounts existed (M0–M4). Since M5
 * it is never opened: each account has its own store, and history from before
 * accounts was deliberately not carried over. Kept as a name so nothing ever
 * reuses it by accident.
 */
export const LEGACY_DB_NAME = 'work-timer';

/** The local store for one account. Two people on one machine never share one. */
export const accountDbName = (userId: string): string => `work-timer-account-${userId}`;

export const createDb = (name: string): WorkTimerDb => {
  const db = new Dexie(name) as WorkTimerDb;

  // v1 (M0) — sessions and the meta store.
  //
  // Indexed: startedAt for chronological history and streak queries, tagId for
  // per-tag stats. (The syncedAt index cannot find unsynced rows: IndexedDB
  // never indexes null, so the M5 outbox scans instead.)
  // `outcome` is deliberately not indexed: it is null for exactly one row at a
  // time and low-cardinality otherwise, so an index would not pay for itself.
  db.version(1).stores({
    sessions: 'id, startedAt, tagId, syncedAt',
    meta: 'key',
  });

  // v2 (M2) — constellation choices. Purely additive: v1 rows are untouched.
  // Indexed on chosenAt (the sky reads choices in order) and syncedAt (outbox).
  db.version(2).stores({
    constellations: 'id, chosenAt, syncedAt',
  });

  // v3 (M4) — tags. Purely additive: existing rows are untouched.
  db.version(3).stores({
    tags: 'id, createdAt, syncedAt',
  });

  return db;
};

/** Stands in for `db` until an account's store is bound, and says so loudly. */
const unbound = new Proxy({} as WorkTimerDb, {
  get: (_target, property) => {
    throw new Error(
      `No account store is open (tried to read db.${String(property)}). ` +
        'The app must bind one with bindAccountDb() before rendering anything that uses it.',
    );
  },
});

/**
 * The signed-in account's local store.
 *
 * A live binding: every module that imports `db` sees the store once
 * `bindAccountDb` has run, which the app does before it renders anything that
 * reads data. Before that, any use throws instead of silently writing to the
 * wrong place. Switching accounts reloads the window rather than rebinding, so
 * no live query or timer can keep hold of the previous account's store.
 */
export let db: WorkTimerDb = unbound;

/**
 * Whether an account's store has been opened. False on the sign-in screen,
 * where reading `db` would throw; anything that can render there (the update
 * notice) checks this first.
 */
export const isAccountDbBound = (): boolean => db !== unbound;

export const bindAccountDb = (userId: string): WorkTimerDb => {
  db = createDb(accountDbName(userId));
  return db;
};

/** Delete an account's local store (after the account itself is deleted). */
export const deleteAccountDb = (userId: string): Promise<void> =>
  Dexie.delete(accountDbName(userId));
