import type {
  ConstellationRow,
  ConstellationTier,
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

export type SyncTable = 'tags' | 'constellations' | 'sessions' | 'user_settings';

/**
 * The settings that follow an account between devices: the idle screen's mode
 * and the Pomodoro lengths. The last-picked tag is deliberately not part of
 * it — each device keeps its own.
 */
export interface SyncedSettings {
  mode: SessionMode;
  settings: PomodoroSettingsRow;
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
  return row;
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
    updatedAt,
  };
};
