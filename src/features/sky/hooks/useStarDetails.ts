import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';

import { db } from '@/shared/db';

import { readStarDetailsInputs, starDetails, type StarDetails } from '../data/starDetails';

/**
 * Your stars' tags, Pomodoro places and companions, live. Read only for your
 * own sky in full mode: the backdrop behind the timer never shows a card, so
 * it never pays for the query.
 */
export const useStarDetails = (enabled: boolean): ReadonlyMap<string, StarDetails> | undefined => {
  const inputs = useLiveQuery(() => (enabled ? readStarDetailsInputs(db) : undefined), [enabled]);
  return useMemo(() => (inputs === undefined ? undefined : starDetails(inputs)), [inputs]);
};
