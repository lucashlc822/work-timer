import type {
  ConstellationRow,
  ConstellationTier,
  LedgerRow,
  PomodoroSettingsRow,
  SessionMode,
  SessionRow,
  TagColor,
  TagRow,
} from '../db';

/**
 * Translation between local rows and the server's columns.
 *
 * Local rows use camelCase and epoch milliseconds; the server uses snake_case
 * and ISO timestamps. Two rules make this safe across app versions:
 *
 * - Going up, only the columns the server knows are sent (never `syncedAt`, a
 *   local-only bookkeeping field, and never `user_id`, which the server fills
 *   from the signed-in account).
 * - Coming down, every row is checked. A row this app can't represent — a
 *   session mode or constellation tier added by a newer version, a malformed
 *   value — is skipped and counted rather than stored half-understood, and
 *   the rest of the batch still applies. Columns this app doesn't know are
 *   ignored.
 */

export type SyncTable = 'tags' | 'constellations' | 'sessions' | 'ledger' | 'user_settings';

/**
 * The settings that follow an account between devices: the idle screen's mode
 * and the Pomodoro lengths, and (M6) the equipped star style, sky theme and
 * daily goal. The last-picked tag is deliberately not part of it — each device
 * keeps its own.
 */
export interface SyncedSettings {
  mode: SessionMode;
  settings: PomodoroSettingsRow;
  /**
   * The equipped star style's key, or null for the default. On a pulled row,
   * `undefined` means the server didn't mention it at all (a server without
   * the M6 migration): keep whatever this device has rather than reset it.
   */
  starStyle?: string | null | undefined;
  /** The equipped sky theme's key, or null for the default (`undefined` as above). */
  skyTheme?: string | null | undefined;
  /** The daily focus goal in minutes, or null for the default (`undefined` as above). */
  dailyGoalMin?: number | null | undefined;
  /** Epoch ms of the edit, on the device that made it. Newest wins. */
  updatedAt: number;
}

/** A row as the server sends it: whatever columns exist, plus the pull cursor. */
export type WireRow = Record<string, unknown> & { server_updated_at: string };

const iso = (ms: number): string => new Date(ms).toISOString();
const isoOrNull = (ms: number | null): string | null => (ms === null ? null : iso(ms));

const TAG_COLORS: readonly TagColor[] = ['lavender', 'mint', 'rose', 'gold', 'sky', 'peach'];
const TIERS: readonly ConstellationTier[] = ['easy', 'medium', 'hard'];

// --- up --------------------------------------------------------------------

export const tagToWire = (row: TagRow) => ({
  id: row.id,
  name: row.name,
  color: row.color,
  created_at: iso(row.createdAt),
  updated_at: iso(row.updatedAt),
  archived_at: isoOrNull(row.archivedAt),
});

export const constellationToWire = (row: ConstellationRow) => ({
  id: row.id,
  source: row.source,
  shape_id: row.shapeId,
  seed: row.seed,
  tier: row.tier,
  chosen_at: iso(row.chosenAt),
  client_created_at: iso(row.clientCreatedAt),
});

/** Only for finished sessions; the outbox never offers an in-flight one. */
export const sessionToWire = (row: SessionRow) => ({
  id: row.id,
  mode: row.mode,
  planned_duration_s: row.plannedDurationS,
  actual_focus_s: row.actualFocusS,
  started_at: iso(row.startedAt),
  ended_at: iso(row.endedAt!),
  outcome: row.outcome,
  away_ms: Math.round(row.awayMs),
  tag_id: row.tagId,
  seed: row.seed,
  device: row.device,
  client_created_at: iso(row.clientCreatedAt),
  run_id: row.runId ?? null,
  run_index: row.runIndex ?? null,
  star_style: row.starStyle ?? null,
});

/** One ledger row; insert-only on the server, like sessions. */
export const ledgerToWire = (row: LedgerRow) => ({
  id: row.id,
  reason: row.reason,
  delta: row.delta,
  ref: row.ref,
  created_at: iso(row.createdAt),
});

/**
 * One row per account; `user_id` comes from the signed-in account. The
 * `pomodoro` object's keys are snake_case like every other server name.
 */
export const settingsToWire = (s: SyncedSettings) => ({
  mode: s.mode,
  pomodoro: {
    focus_s: s.settings.focusS,
    short_break_s: s.settings.shortBreakS,
    long_break_s: s.settings.longBreakS,
    blocks_per_long_break: s.settings.blocksPerLongBreak,
  },
  star_style: s.starStyle ?? null,
  sky_theme: s.skyTheme ?? null,
  daily_goal_min: s.dailyGoalMin ?? null,
  updated_at: iso(s.updatedAt),
});

// --- down ------------------------------------------------------------------

const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const ms = (v: unknown): number | null => {
  if (typeof v !== 'string') return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
};

/**
 * A pulled tag, or null if it can't be represented. An unknown colour (a
 * newer palette) falls back to the first colour rather than dropping the tag,
 * so its name and its sessions' label survive.
 */
export const tagFromWire = (w: WireRow, syncedAt: number): TagRow | null => {
  const createdAt = ms(w.created_at);
  const updatedAt = ms(w.updated_at);
  const archivedAt = w.archived_at === null ? null : ms(w.archived_at);
  if (!str(w.id) || !str(w.name) || createdAt === null || updatedAt === null) return null;
  if (w.archived_at !== null && archivedAt === null) return null;
  const color = TAG_COLORS.includes(w.color as TagColor) ? (w.color as TagColor) : TAG_COLORS[0]!;
  return { id: w.id, name: w.name, color, createdAt, updatedAt, archivedAt, syncedAt };
};

export const constellationFromWire = (w: WireRow, syncedAt: number): ConstellationRow | null => {
  const chosenAt = ms(w.chosen_at);
  const clientCreatedAt = ms(w.client_created_at);
  if (!str(w.id) || chosenAt === null || clientCreatedAt === null) return null;
  if (w.source !== 'catalogue' && w.source !== 'generated') return null;
  if (!TIERS.includes(w.tier as ConstellationTier)) return null;
  const shapeId = w.shape_id === null ? null : str(w.shape_id) ? w.shape_id : undefined;
  const seed = w.seed === null ? null : str(w.seed) ? w.seed : undefined;
  if (shapeId === undefined || seed === undefined) return null;
  return {
    id: w.id,
    source: w.source,
    shapeId,
    seed,
    tier: w.tier as ConstellationTier,
    chosenAt,
    clientCreatedAt,
    syncedAt,
  };
};

export const sessionFromWire = (w: WireRow, syncedAt: number): SessionRow | null => {
  const startedAt = ms(w.started_at);
  const endedAt = ms(w.ended_at);
  const clientCreatedAt = ms(w.client_created_at);
  if (!str(w.id) || startedAt === null || endedAt === null || clientCreatedAt === null) return null;
  if (w.mode !== 'countdown' && w.mode !== 'pomodoro') return null;
  if (w.outcome !== 'completed' && w.outcome !== 'cancelled') return null;
  if (!num(w.planned_duration_s) || !num(w.actual_focus_s) || !str(w.seed)) return null;
  const awayMs = num(w.away_ms) ? w.away_ms : Number(w.away_ms);
  if (!Number.isFinite(awayMs)) return null;
  if (w.tag_id !== null && !str(w.tag_id)) return null;

  const row: SessionRow = {
    id: w.id,
    mode: w.mode,
    plannedDurationS: w.planned_duration_s,
    actualFocusS: w.actual_focus_s,
    startedAt,
    endedAt,
    outcome: w.outcome,
    awayMs,
    tagId: w.tag_id,
    seed: w.seed,
    device: typeof w.device === 'string' ? w.device : '',
    clientCreatedAt,
    syncedAt,
  };
  // Optional, absent on countdowns (matching how the timer writes them).
  if (str(w.run_id)) row.runId = w.run_id;
  if (num(w.run_index)) row.runIndex = w.run_index;
  // Absent from older apps' rows (and on cancelled sessions): the default look.
  // A style key this version doesn't know is kept as-is and drawn as the default.
  if (str(w.star_style)) row.starStyle = w.star_style;
  return row;
};

/**
 * A pulled ledger row, or null if it can't be represented. Whole-number deltas
 * only: Stardust is never fractional.
 */
export const ledgerFromWire = (w: WireRow, syncedAt: number): LedgerRow | null => {
  const createdAt = ms(w.created_at);
  if (!str(w.id) || !str(w.reason) || createdAt === null) return null;
  if (!num(w.delta) || !Number.isInteger(w.delta)) return null;
  if (w.ref !== null && w.ref !== undefined && typeof w.ref !== 'string') return null;
  return {
    id: w.id,
    reason: w.reason,
    delta: w.delta,
    ref: typeof w.ref === 'string' ? w.ref : null,
    createdAt,
    syncedAt,
  };
};

const count = (v: unknown): v is number => num(v) && Number.isInteger(v) && v > 0;

/**
 * Pulled settings, or null if this app can't use them (a mode added by a newer
 * version, a length that isn't a whole positive number). Ranges are not
 * checked here: reading the settings clamps them to this build's limits.
 */
export const settingsFromWire = (w: WireRow): SyncedSettings | null => {
  const updatedAt = ms(w.updated_at);
  if (updatedAt === null) return null;
  if (w.mode !== 'countdown' && w.mode !== 'pomodoro') return null;
  const p = w.pomodoro as Record<string, unknown> | null;
  if (typeof p !== 'object' || p === null) return null;
  const { focus_s, short_break_s, long_break_s, blocks_per_long_break } = p;
  if (!count(focus_s) || !count(short_break_s) || !count(long_break_s)) return null;
  if (!count(blocks_per_long_break)) return null;
  return {
    mode: w.mode,
    settings: {
      focusS: focus_s,
      shortBreakS: short_break_s,
      longBreakS: long_break_s,
      blocksPerLongBreak: blocks_per_long_break,
    },
    // M6 columns. Never a reason to drop the whole row: an unusable value means
    // "default". A column the server didn't send at all stays undefined, so the
    // device keeps its own value (see SyncedSettings).
    starStyle: !('star_style' in w) ? undefined : str(w.star_style) ? w.star_style : null,
    skyTheme: !('sky_theme' in w) ? undefined : str(w.sky_theme) ? w.sky_theme : null,
    dailyGoalMin: !('daily_goal_min' in w)
      ? undefined
      : count(w.daily_goal_min)
        ? w.daily_goal_min
        : null,
    updatedAt,
  };
};
