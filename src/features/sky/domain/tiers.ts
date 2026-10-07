import type { Tier, TierRules } from './types';

/**
 * How hard each tier is, and how rich it looks.
 *
 * Difficulty combines three levers. **Star count** and a **minimum session
 * length per star** are the gates; **total focus time** follows from those two
 * (N stars of 50+ minutes is at least N × 50 minutes) so it is shown rather
 * than enforced, and longer sessions make brighter stars.
 */
export const TIERS = {
  easy: { label: 'Easy', stars: [4, 5], minSessionMin: 0, style: 'plain' },
  medium: { label: 'Medium', stars: [7, 9], minSessionMin: 25, style: 'glow' },
  hard: { label: 'Hard', stars: [12, 16], minSessionMin: 50, style: 'nebula' },
} as const satisfies Record<
  Tier,
  {
    label: string;
    stars: readonly [number, number];
    minSessionMin: number;
    style: 'plain' | 'glow' | 'nebula';
  }
>;

/**
 * Minimums shrunk so medium and hard can be exercised with the dev-only 1- and
 * 2-minute presets: medium accepts a 1-minute session, hard needs 2, so a
 * 1-minute session aimed at hard tests the "too short" path.
 */
const DEV_MIN_SESSION_MIN: Record<Tier, number> = { easy: 0, medium: 1, hard: 2 };

const MIN_SESSION_MIN: Record<Tier, number> = {
  easy: TIERS.easy.minSessionMin,
  medium: TIERS.medium.minSessionMin,
  hard: TIERS.hard.minSessionMin,
};

/** The rules actually enforced. Callers pass `import.meta.env.DEV`. */
export const tierRules = (dev: boolean): TierRules => {
  const minutes = dev ? DEV_MIN_SESSION_MIN : MIN_SESSION_MIN;
  return {
    easy: { minSessionS: minutes.easy * 60 },
    medium: { minSessionS: minutes.medium * 60 },
    hard: { minSessionS: minutes.hard * 60 },
  };
};

/** Unlock requirement: one finished constellation of the tier below. */
export const UNLOCKED_BY: Record<Tier, Tier | null> = {
  easy: null,
  medium: 'easy',
  hard: 'medium',
};

/**
 * Rough total focus a constellation takes, for the picker. Assumes a 25-minute
 * session when the tier has no minimum, since that is the default length.
 */
export const approximateFocusS = (tier: Tier, starCount: number, rules: TierRules): number =>
  starCount * Math.max(rules[tier].minSessionS, 25 * 60);
