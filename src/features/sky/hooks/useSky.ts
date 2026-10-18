import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';

import { db } from '@/shared/db';

import { readSkyInputs } from '../data/skyRepository';
import { deriveSky, unlockedTiers } from '../domain/derive';
import { tierRules } from '../domain/tiers';
import type { SkyState, Tier } from '../domain/types';

/** The tier rules in force for this build: shrunk minimums in dev only. */
export const RULES = tierRules(import.meta.env.DEV);

/**
 * The derived sky, live.
 *
 * Re-derives whenever sessions or choices change — including when the timer
 * finishes a session, which is how a new star appears with no message passing
 * between the two features. `undefined` until the first read completes.
 */
export const useSky = (): SkyState | undefined => {
  const inputs = useLiveQuery(() => readSkyInputs(db), []);
  return useMemo(
    () => (inputs === undefined ? undefined : deriveSky(inputs.sessions, inputs.choices, RULES)),
    [inputs],
  );
};

/** A finished constellation, in the shape progression pays a bonus for. */
export interface ConstellationCompletion {
  choiceId: string;
  tier: Tier;
  completedAt: number;
}

/**
 * Every constellation the person has finished, live — `undefined` until the
 * first read. This is the sky's whole answer to "what has been completed?", so
 * `app/` can hand it to progression without the two features meeting.
 */
export const useConstellationCompletions = (): ConstellationCompletion[] | undefined => {
  const sky = useSky();
  return useMemo(
    () =>
      sky === undefined
        ? undefined
        : sky.constellations.flatMap((c) =>
            c.complete && c.completedAt !== null
              ? [{ choiceId: c.choice.id, tier: c.def.tier, completedAt: c.completedAt }]
              : [],
          ),
    [sky],
  );
};

/** The tiers earned by finishing the tier below, live; bought tiers are not included. */
export const useEarnedTiers = (): Record<Tier, boolean> | undefined => {
  const sky = useSky();
  return useMemo(() => (sky === undefined ? undefined : unlockedTiers(sky)), [sky]);
};
