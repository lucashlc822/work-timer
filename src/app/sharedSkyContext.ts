import { createContext, useContext } from 'react';

import type { DescribeShared, Shared } from '@/features/friends';
import type { SharedCompletion } from '@/features/progression';
import type { SharedState } from '@/features/sky';

/** Shared constellations for anything rendered inside `SharedSkyProvider` (M7 phase 5). */
export interface SharedSky {
  shared: Shared;
  /** Every shared constellation as drawn, proposals included; empty until loaded. */
  states: readonly SharedState[];
  /** Finished ones by the server's count, for the Stardust reconciler. */
  completions: readonly SharedCompletion[];
  describe: DescribeShared;
}

export const SharedSkyContext = createContext<SharedSky | null>(null);

export const useSharedSky = (): SharedSky => {
  const value = useContext(SharedSkyContext);
  if (value === null) throw new Error('useSharedSky outside SharedSkyProvider');
  return value;
};
