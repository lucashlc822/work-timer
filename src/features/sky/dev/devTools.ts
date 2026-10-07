import { db } from '@/shared/db';
import { systemClock } from '@/shared/lib';

import { seedCompletedSessions } from '../data/skyRepository';
import { frameCount } from '../hooks/useFrameLoop';

/**
 * Dev-only console helpers, installed as `window.__starkeep`.
 *
 * Only ever loaded through a dynamic import behind `import.meta.env.DEV`
 * (see `installDevTools` in the sky's index), so production builds contain
 * none of it.
 *
 * - `__starkeep.seed(n, minutes)` writes `n` completed sessions that land in
 *   the current constellation — for testing tiers and gating in seconds.
 * - `__starkeep.frames()` is the ambient sky's frame count: call it twice a
 *   few seconds apart while the window is hidden to confirm the loop stopped.
 */
export const install = (): void => {
  Object.assign(window, {
    __starkeep: {
      seed: (count = 1, minutes = 25) => seedCompletedSessions(db, count, minutes, systemClock),
      frames: frameCount,
    },
  });
};
