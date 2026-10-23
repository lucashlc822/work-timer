import { deriveSky } from './derive';
import { tierRules } from './tiers';
import type { CompletedSession, ConstellationChoice, SkyState } from './types';

/**
 * Someone else's sky (M7): a friend's sessions and choices, fetched from the
 * server rather than read from this device's store.
 *
 * Always under the real tier rules, never the shrunk dev ones: the sky must
 * look the same as it does on its owner's released app.
 */

/** A session as another person's sky receives it: ended, with its outcome. */
export interface OtherSession extends CompletedSession {
  outcome: 'completed' | 'cancelled';
}

const RELEASED_RULES = tierRules(false);

/** Derive another person's sky. Ended-early sessions earn no star, as on their own device. */
export const deriveOtherSky = (
  sessions: readonly OtherSession[],
  choices: readonly ConstellationChoice[],
): SkyState =>
  deriveSky(
    sessions
      .filter((s) => s.outcome === 'completed')
      .map(({ outcome: _outcome, ...completed }) => completed),
    choices,
    RELEASED_RULES,
  );

/** How many constellations are finished. */
export const completedConstellations = (sky: SkyState): number =>
  sky.constellations.filter((c) => c.complete).length;
