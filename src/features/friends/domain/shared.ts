/**
 * Shared constellations (M7 phase 5) as the server's `my_shared` sends them,
 * decoded into plain values. Like `friendSky.ts`, a row that can't be read is
 * dropped rather than fatal.
 *
 * Which stars fill one, and whether it is finished, is not decided here: the
 * sky feature derives that, through `app/`.
 */

export type SharedTier = 'easy' | 'medium' | 'hard';

/** A session either member ran for it. */
export interface SharedSession {
  id: string;
  userId: string;
  seed: string;
  startedAt: number;
  endedAt: number;
  actualFocusS: number;
  starStyle?: string;
}

export interface SharedRow {
  id: string;
  proposedBy: string;
  partnerId: string;
  /** Null when the partner never picked a name, or deleted it. */
  partnerName: string | null;
  source: 'catalogue' | 'generated';
  shapeId: string | null;
  seed: string | null;
  tier: SharedTier;
  starsNeeded: number;
  minFocusS: number;
  createdAt: number;
  /** Null while it is a proposal. */
  acceptedAt: number | null;
  /** Set once stopped or unfriended: it no longer fills. */
  stoppedAt: number | null;
  sessions: SharedSession[];
}

/** What a proposal sends: the shape, and the two numbers the server judges "finished" by. */
export interface SharedDraft {
  source: 'catalogue' | 'generated';
  shapeId: string | null;
  seed: string | null;
  tier: SharedTier;
  starsNeeded: number;
  minFocusS: number;
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
const whole = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null;
const optionalText = (v: unknown): string | null | undefined =>
  v === null || v === undefined ? null : (text(v) ?? undefined);
const optionalTime = (v: unknown): number | null | undefined =>
  v === null || v === undefined ? null : (time(v) ?? undefined);

const session = (v: unknown): SharedSession | null => {
  if (!isObject(v)) return null;
  const id = text(v.id);
  const userId = text(v.user_id);
  const seed = text(v.seed);
  const startedAt = time(v.started_at);
  const endedAt = time(v.ended_at);
  const actualFocusS = whole(v.actual_focus_s);
  if (
    id === null ||
    userId === null ||
    seed === null ||
    startedAt === null ||
    endedAt === null ||
    actualFocusS === null
  ) {
    return null;
  }
  const starStyle = text(v.star_style);
  return {
    id,
    userId,
    seed,
    startedAt,
    endedAt,
    actualFocusS,
    ...(starStyle !== null && { starStyle }),
  };
};

const row = (v: unknown): SharedRow | null => {
  if (!isObject(v)) return null;
  const id = text(v.id);
  const proposedBy = text(v.proposed_by);
  const partnerId = text(v.partner_id);
  const shapeId = optionalText(v.shape_id);
  const seed = optionalText(v.seed);
  const starsNeeded = whole(v.stars_needed);
  const minFocusS = whole(v.min_focus_s);
  const createdAt = time(v.created_at);
  const acceptedAt = optionalTime(v.accepted_at);
  const stoppedAt = optionalTime(v.stopped_at);
  const { source, tier } = v;
  if (
    id === null ||
    proposedBy === null ||
    partnerId === null ||
    shapeId === undefined ||
    seed === undefined ||
    starsNeeded === null ||
    minFocusS === null ||
    createdAt === null ||
    acceptedAt === undefined ||
    stoppedAt === undefined ||
    (source !== 'catalogue' && source !== 'generated') ||
    (tier !== 'easy' && tier !== 'medium' && tier !== 'hard')
  ) {
    return null;
  }
  return {
    id,
    proposedBy,
    partnerId,
    partnerName: text(v.partner_name),
    source,
    shapeId,
    seed,
    tier,
    starsNeeded,
    minFocusS,
    createdAt,
    acceptedAt,
    stoppedAt,
    sessions: Array.isArray(v.sessions) ? v.sessions.flatMap((s) => session(s) ?? []) : [],
  };
};

export const decodeShared = (payload: unknown): SharedRow[] =>
  Array.isArray(payload) ? payload.flatMap((item) => row(item) ?? []) : [];

/**
 * What `app/` knows about a shared constellation that this feature doesn't:
 * its shape's name and how far it has filled, from the sky feature.
 */
export interface SharedProgress {
  name: string;
  stars: number;
  total: number;
  done: boolean;
}

export type DescribeShared = (row: SharedRow) => SharedProgress;

/**
 * The one the pair has open — a proposal, or one still filling — if any. A
 * finished or stopped one doesn't count: they can start another.
 */
export const openWith = (
  rows: readonly SharedRow[],
  friendId: string,
  describe: DescribeShared,
): SharedRow | null =>
  rows.find((r) => r.partnerId === friendId && r.stoppedAt === null && !describe(r).done) ?? null;

/** Proposals someone made to you, waiting for an answer. */
export const incomingProposals = (rows: readonly SharedRow[] | null, me: string): SharedRow[] =>
  (rows ?? []).filter((r) => r.acceptedAt === null && r.proposedBy !== me);
