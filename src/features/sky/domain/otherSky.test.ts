import { describe, expect, it } from 'vitest';

import { deriveSky } from './derive';
import { completedConstellations, deriveOtherSky, type OtherSession } from './otherSky';
import { tierRules } from './tiers';
import type { ConstellationChoice } from './types';

const T0 = 1_700_000_000_000;
const at = (min: number) => T0 + min * 60_000;

const sessions: OtherSession[] = [
  // Five completed 25-minute sessions after the kite was chosen (it needs 4–5 stars).
  ...[20, 50, 80, 110, 140].map((end, i): OtherSession => ({
    id: `s${i}`,
    seed: `seed-${i}`,
    startedAt: at(end - 25),
    endedAt: at(end),
    actualFocusS: 1500,
    outcome: 'completed',
  })),
  // Ended early: no star, on anyone's sky.
  {
    id: 'x',
    seed: 'seed-x',
    startedAt: at(150),
    endedAt: at(155),
    actualFocusS: 300,
    outcome: 'cancelled',
  },
];

const choices: ConstellationChoice[] = [
  { id: 'c1', source: 'catalogue', shapeId: 'kite', seed: null, tier: 'easy', chosenAt: at(0) },
];

describe('deriveOtherSky', () => {
  it('is the owner’s own sky: completed sessions only, under the released tier rules', () => {
    const completed = sessions
      .filter((s) => s.outcome === 'completed')
      .map(({ outcome: _o, ...rest }) => rest);
    expect(deriveOtherSky(sessions, choices)).toEqual(
      deriveSky(completed, choices, tierRules(false)),
    );
  });

  it('never gives an ended-early session a star', () => {
    const sky = deriveOtherSky(sessions, choices);
    const starIds = [
      ...sky.constellations.flatMap((c) => c.stars.map((s) => s.id)),
      ...sky.wandering.map((w) => w.session.id),
    ];
    expect(starIds).not.toContain('x');
  });

  it('counts finished constellations', () => {
    expect(completedConstellations(deriveOtherSky(sessions, choices))).toBe(1);
    expect(completedConstellations(deriveOtherSky([], choices))).toBe(0);
  });
});
