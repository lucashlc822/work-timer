import { describe, expect, it } from 'vitest';

import {
  ART_COMPLETE,
  ART_MIN,
  ART_RANGE,
  OUTLINE_COMPLETE,
  OUTLINE_MIN,
  artOpacity,
  easeOut,
  outlineOpacity,
} from './atlasFade';

describe('the atlas fade', () => {
  it('starts barely there and ends fully drawn', () => {
    expect(artOpacity(0, false)).toBeCloseTo(ART_MIN, 9);
    expect(artOpacity(1, true)).toBe(ART_COMPLETE);
    expect(outlineOpacity(0, false)).toBeCloseTo(OUTLINE_MIN, 9);
    expect(outlineOpacity(1, true)).toBe(OUTLINE_COMPLETE);
  });

  it('is clearer with every star, the first ones most', () => {
    const steps = [0, 0.25, 0.5, 0.75, 1].map((f) => artOpacity(f, false));
    for (let i = 1; i < steps.length; i++) expect(steps[i]!).toBeGreaterThan(steps[i - 1]!);
    expect(steps[1]! - steps[0]!).toBeGreaterThan(steps[4]! - steps[3]!);
  });

  it('is never clearer, when nearly done, than when done', () => {
    expect(artOpacity(0.999, false)).toBeLessThan(ART_COMPLETE);
    expect(ART_MIN + ART_RANGE).toBeLessThan(ART_COMPLETE);
  });

  it('keeps a figure with no art fainter than one with art', () => {
    for (const f of [0, 0.5, 1]) {
      expect(outlineOpacity(f, false)).toBeLessThan(artOpacity(f, false));
    }
    expect(outlineOpacity(1, true)).toBeLessThan(artOpacity(1, true));
  });

  it('clamps the ease to 0 to 1', () => {
    expect(easeOut(-1)).toBe(0);
    expect(easeOut(2)).toBe(1);
  });
});
