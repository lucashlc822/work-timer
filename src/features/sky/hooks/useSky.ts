import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';

import { db } from '@/shared/db';

import { readSkyInputs } from '../data/skyRepository';
import { deriveSky } from '../domain/derive';
import { tierRules } from '../domain/tiers';
import type { SkyState } from '../domain/types';

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
