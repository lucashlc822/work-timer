import { db } from '@/shared/db';
import { systemClock } from '@/shared/lib';

import { clearSeeded, seedHistory } from '../data/seedHistory';

/**
 * Dev-only console helpers, merged into `window.__starkeep` beside the sky's.
 *
 * - `__starkeep.seedHistory(days)` writes a few weeks of plausible sessions
 *   (and three demo tags if there are none) so the stats have data.
 * - `__starkeep.clearSeeded()` removes exactly the sessions it wrote.
 *
 * Seeded sessions are ordinary completed sessions, so they also appear as
 * stars in the sky.
 */
export const install = (): void => {
  const host = window as unknown as { __starkeep?: Record<string, unknown> };
  host.__starkeep = {
    ...host.__starkeep,
    seedHistory: (days = 30) => seedHistory(db, days, systemClock),
    clearSeeded: () => clearSeeded(db),
  };
};
