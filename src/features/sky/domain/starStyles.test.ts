import { describe, expect, it } from 'vitest';

import { starAppearance } from './starAppearance';
import { STAR_STYLES, starStyleFor } from './starStyles';

// Captured from `starAppearance` as it was before star styles existed (M6 PR 3).
// If these change, every star already in someone's sky changes colour.
const GOLDEN = [
  {
    seed: 'alpha',
    focusS: 1500,
    color: '#ffedcf',
    radius: 0.9960933084537693,
    brightness: 0.801418510567422,
    twinklePhase: 5.114342470149513,
    twinklePeriodMs: 3109.06717851758,
  },
  {
    seed: 'beta',
    focusS: 300,
    color: '#fff2dd',
    radius: 0.7484567631385289,
    brightness: 0.7,
    twinklePhase: 2.8958238031192494,
    twinklePeriodMs: 4983.91603268683,
  },
  {
    seed: 'gamma',
    focusS: 10800,
    color: '#fff4e0',
    radius: 1.399707770626992,
    brightness: 1,
    twinklePhase: 3.079459143422554,
    twinklePeriodMs: 3868.998068012297,
  },
  {
    seed: 'star-42',
    focusS: 3000,
    color: '#fff8ea',
    radius: 1.1596425532749326,
    brightness: 0.8521277658511329,
    twinklePhase: 3.283226673718094,
    twinklePeriodMs: 2841.8380830436945,
  },
];

describe('starAppearance with the classic style', () => {
  // Case 9
  it.each(GOLDEN)('matches the pre-M6 look for $seed', ({ seed, focusS, ...expected }) => {
    expect(starAppearance(seed, focusS)).toMatchObject(expected);
    expect(starAppearance(seed, focusS, 'classic')).toMatchObject(expected);
    expect(starAppearance(seed, focusS, 'classic').glow).toBe(1);
  });

  // Case 9
  it('draws an unknown, null or absent style as classic', () => {
    for (const style of ['from-the-future', '', null, undefined]) {
      expect(starAppearance('alpha', 1500, style)).toEqual(starAppearance('alpha', 1500));
    }
    expect(starStyleFor('from-the-future')).toBe(STAR_STYLES['classic']);
  });
});

describe('the other styles', () => {
  const others = Object.keys(STAR_STYLES).filter((key) => key !== 'classic');

  it('change colour and glow, and nothing that says how long the session was', () => {
    const base = starAppearance('alpha', 1500);
    for (const style of others) {
      const styled = starAppearance('alpha', 1500, style);
      expect(styled.color, style).not.toBe(base.color);
      expect(styled.radius, style).toBe(base.radius);
      expect(styled.brightness, style).toBe(base.brightness);
      expect(styled.twinklePhase, style).toBe(base.twinklePhase);
      expect(styled.twinklePeriodMs, style).toBe(base.twinklePeriodMs);
      expect(styled.glow, style).toBeGreaterThan(1);
    }
  });

  it('are deterministic: the same seed and style always give the same star', () => {
    for (const style of others) {
      expect(starAppearance('seed-9', 2400, style)).toEqual(starAppearance('seed-9', 2400, style));
    }
  });

  it('produce valid hex colours', () => {
    for (const style of others) {
      for (const seed of ['a', 'b', 'c', 'd', 'e']) {
        expect(starAppearance(seed, 1500, style).color).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });
});
