/**
 * A friend's sky as the server's `friend_sky` sends it, decoded into plain
 * values the app can draw (M7).
 *
 * Its own decoder rather than `shared/sync/wire.ts`: that one is for your own
 * synced rows and refuses any row missing fields a friend's sky deliberately
 * leaves out (tag, device, away time). A row that can't be read is dropped,
 * not fatal, so a newer server adding fields never blanks the sky.
 */

export interface FriendSession {
  id: string;
  seed: string;
  startedAt: number;
  endedAt: number;
  actualFocusS: number;
  outcome: 'completed' | 'cancelled';
  starStyle?: string;
  /** Run for a shared constellation (M7 phase 5): it belongs there, not on their own sky. */
  sharedId?: string;
}

export interface FriendChoice {
  id: string;
  source: 'catalogue' | 'generated';
  shapeId: string | null;
  seed: string | null;
  tier: 'easy' | 'medium' | 'hard';
  chosenAt: number;
}

export interface FriendSky {
  displayName: string | null;
  themeKey: string | null;
  sessions: FriendSession[];
  choices: FriendChoice[];
}

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const time = (v: unknown): number | null => {
  if (typeof v !== 'string') return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
};
const optionalText = (v: unknown): string | null | undefined =>
  v === null || v === undefined ? null : (text(v) ?? undefined);

const session = (v: unknown): FriendSession | null => {
  if (!isObject(v)) return null;
  const id = text(v.id);
  const seed = text(v.seed);
  const startedAt = time(v.started_at);
  const endedAt = time(v.ended_at);
  const actualFocusS = typeof v.actual_focus_s === 'number' ? v.actual_focus_s : NaN;
  const outcome = v.outcome;
  if (
    id === null ||
    seed === null ||
    startedAt === null ||
    endedAt === null ||
    !Number.isFinite(actualFocusS) ||
    (outcome !== 'completed' && outcome !== 'cancelled')
  ) {
    return null;
  }
  const starStyle = text(v.star_style);
  const sharedId = text(v.shared_id);
  return {
    id,
    seed,
    startedAt,
    endedAt,
    actualFocusS,
    outcome,
    ...(starStyle !== null && { starStyle }),
    ...(sharedId !== null && { sharedId }),
  };
};

const choice = (v: unknown): FriendChoice | null => {
  if (!isObject(v)) return null;
  const id = text(v.id);
  const chosenAt = time(v.chosen_at);
  const shapeId = optionalText(v.shape_id);
  const seed = optionalText(v.seed);
  const { source, tier } = v;
  if (
    id === null ||
    chosenAt === null ||
    shapeId === undefined ||
    seed === undefined ||
    (source !== 'catalogue' && source !== 'generated') ||
    (tier !== 'easy' && tier !== 'medium' && tier !== 'hard')
  ) {
    return null;
  }
  return { id, source, shapeId, seed, tier, chosenAt };
};

const each = <T>(v: unknown, decode: (item: unknown) => T | null): T[] =>
  Array.isArray(v) ? v.flatMap((item) => decode(item) ?? []) : [];

/** `null` only when the payload isn't a sky at all. */
export const decodeFriendSky = (payload: unknown): FriendSky | null => {
  if (!isObject(payload)) return null;
  return {
    displayName: text(payload.display_name),
    themeKey: text(payload.sky_theme),
    sessions: each(payload.sessions, session),
    choices: each(payload.constellations, choice),
  };
};
