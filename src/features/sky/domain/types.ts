/**
 * Sky domain types.
 *
 * The sky is *derived*: the only thing the user's choices add to storage is
 * "at time T I started building constellation C". Everything else here —
 * which star sits in which slot, whether a constellation is complete — is
 * recomputed from sessions and choices by `deriveSky`.
 */

export type Tier = 'easy' | 'medium' | 'hard';

export const TIER_ORDER: readonly Tier[] = ['easy', 'medium', 'hard'];

/** A point in the unit square, y pointing down. */
export type Point = readonly [x: number, y: number];

/**
 * A constellation's shape.
 *
 * Points are listed in **growth order**: every point after the first has an
 * edge to some earlier point. Slots fill in that order, so a half-built
 * constellation is always one connected figure rather than scattered dots.
 */
export interface ShapeDef {
  points: readonly Point[];
  edges: readonly (readonly [number, number])[];
}

/** A constellation the user can choose: a shape plus its identity. */
export interface ConstellationDef {
  source: 'catalogue' | 'generated';
  /** Catalogue key, or null for a generated constellation. */
  shapeId: string | null;
  /** Generator seed, or null for a catalogue constellation. */
  seed: string | null;
  name: string;
  tier: Tier;
  shape: ShapeDef;
}

/** The user's choice to start building a constellation. Append-only. */
export interface ConstellationChoice {
  id: string;
  source: 'catalogue' | 'generated';
  shapeId: string | null;
  seed: string | null;
  tier: Tier;
  chosenAt: number;
}

/** The subset of a completed session the sky needs. */
export interface CompletedSession {
  id: string;
  seed: string;
  startedAt: number;
  endedAt: number;
  actualFocusS: number;
  /** The star style equipped when it completed (M6); absent for older sessions. */
  starStyle?: string;
  /**
   * The shared constellation it was run for (M7 phase 5). Such a session
   * belongs to that constellation only: one's own sky leaves it out.
   */
  sharedId?: string;
}

export interface ConstellationState {
  choice: ConstellationChoice;
  def: ConstellationDef;
  /** Filled slots, in growth order. `stars[i]` sits at `def.shape.points[i]`. */
  stars: CompletedSession[];
  complete: boolean;
  /** The last star's `endedAt` once complete, otherwise null. */
  completedAt: number | null;
  /** Superseded by a later choice before it was finished. */
  abandoned: boolean;
}

export type WanderingReason =
  /** No constellation was being built when the session ended. */
  | 'no-constellation'
  /** Shorter than the current constellation's tier minimum. */
  | 'too-short'
  /** The current constellation was already full. */
  | 'constellation-complete';

export interface WanderingStar {
  session: CompletedSession;
  reason: WanderingReason;
  /** The constellation it could not join, when there was one. */
  constellationId: string | null;
}

export interface SkyState {
  /** Every chosen constellation, oldest first. */
  constellations: ConstellationState[];
  wandering: WanderingStar[];
  /** The latest choice, if it is still being built. */
  current: ConstellationState | null;
}

/** Per-tier rules, in seconds. See `tierRules`. */
export type TierRules = Record<Tier, { minSessionS: number }>;
