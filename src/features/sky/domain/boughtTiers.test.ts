import { describe, expect, it } from 'vitest';

import { deriveSky, unlockedTiers } from './derive';
import { tierRules } from './tiers';
import type { CompletedSession, ConstellationChoice, Tier } from './types';

const rules = tierRules(false);
const T0 = 1_700_000_000_000;

const session = (i: number, focusMin = 25): CompletedSession => {
  const endedAt = T0 + i * 60 * 60_000;
  return {
    id: `s${i}`,
    seed: `seed-${i}`,
    startedAt: endedAt - focusMin * 60_000,
    endedAt,
    actualFocusS: focusMin * 60,
  };
};

const choice = (id: string, shapeId: string, tier: Tier): ConstellationChoice => ({
  id,
  source: 'catalogue',
  shapeId,
  seed: null,
  tier,
  chosenAt: T0,
});

// Case 8
describe('unlockedTiers with tiers bought early', () => {
  const fresh = deriveSky([], [], rules);

  it('opens a bought tier on a fresh sky, without finishing an easier one', () => {
    expect(unlockedTiers(fresh, new Set<Tier>(['medium']))).toEqual({
      easy: true,
      medium: true,
      hard: false,
    });
    expect(unlockedTiers(fresh, new Set<Tier>(['hard']))).toEqual({
      easy: true,
      medium: false,
      hard: true,
    });
  });

  it('changes nothing when nothing is bought', () => {
    expect(unlockedTiers(fresh)).toEqual(unlockedTiers(fresh, new Set()));
    expect(unlockedTiers(fresh)).toEqual({ easy: true, medium: false, hard: false });
  });

  it('still opens the next tier by finishing one, bought or not (the earned path)', () => {
    // Four stars finish an easy catalogue shape (as in derive.test.ts).
    const sky = deriveSky(
      [session(1), session(2), session(3), session(4)],
      [choice('c1', 'kite', 'easy')],
      rules,
    );
    expect(unlockedTiers(sky)).toEqual({ easy: true, medium: true, hard: false });
    expect(unlockedTiers(sky, new Set<Tier>(['hard']))).toEqual({
      easy: true,
      medium: true,
      hard: true,
    });
  });
});
