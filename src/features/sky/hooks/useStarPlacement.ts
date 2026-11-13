import { useMemo } from 'react';

import type { SkyState, Tier, WanderingReason } from '../domain/types';
import { useSky } from './useSky';

/** Where a session's star went, as the derived sky has it. */
export type StarPlacement =
  | {
      kind: 'constellation';
      name: string;
      /** 1-based: this star is `index` of `total`. */
      index: number;
      total: number;
      /** The constellation this very star finished, if it did. */
      completes: { choiceId: string; tier: Tier; name: string; completedAt: number } | null;
    }
  | {
      kind: 'wandering';
      reason: WanderingReason;
      /** The constellation it could not join, when there was one. */
      target: { name: string; tier: Tier } | null;
    };

/** Pure: the placement of `sessionId` in `sky`, or null if it has no star there (yet). */
export const starPlacement = (sky: SkyState, sessionId: string): StarPlacement | null => {
  for (const c of sky.constellations) {
    const index = c.stars.findIndex((s) => s.id === sessionId);
    if (index === -1) continue;
    const total = c.def.shape.points.length;
    const completes =
      c.complete && index === total - 1 && c.completedAt !== null
        ? {
            choiceId: c.choice.id,
            tier: c.def.tier,
            name: c.def.name,
            completedAt: c.completedAt,
          }
        : null;
    return { kind: 'constellation', name: c.def.name, index: index + 1, total, completes };
  }
  const wandering = sky.wandering.find((w) => w.session.id === sessionId);
  if (wandering === undefined) return null;
  const target = sky.constellations.find((c) => c.choice.id === wandering.constellationId);
  return {
    kind: 'wandering',
    reason: wandering.reason,
    target: target === undefined ? null : { name: target.def.name, tier: target.def.tier },
  };
};

/**
 * Where a just-finished session's star went, live: the result's "Added to"
 * line reads it, and `app/` hands its `completes` to progression for the
 * constellation bonus line. `undefined` while the sky loads; null when the
 * session has no star in your own sky (an early ending, or a session run for a
 * shared constellation).
 */
export const useStarPlacement = (sessionId: string): StarPlacement | null | undefined => {
  const sky = useSky();
  return useMemo(
    () => (sky === undefined ? undefined : starPlacement(sky, sessionId)),
    [sky, sessionId],
  );
};
