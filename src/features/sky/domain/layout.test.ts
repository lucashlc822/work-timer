import { describe, expect, it } from 'vitest';

import { gridPlacements, wanderingPosition } from './layout';

describe('wanderingPosition', () => {
  const seeds = Array.from({ length: 200 }, (_, i) => `seed-${i}`);

  it('is the same place every time, anywhere in the window by default', () => {
    for (const seed of seeds) {
      const [x, y] = wanderingPosition(seed, 1000, 800);
      expect(wanderingPosition(seed, 1000, 800)).toEqual([x, y]);
      expect(x).toBeGreaterThanOrEqual(40);
      expect(x).toBeLessThanOrEqual(960);
      expect(y).toBeGreaterThanOrEqual(32);
      expect(y).toBeLessThanOrEqual(768);
    }
  });

  it('with no area to keep to, is exactly the whole-window position', () => {
    for (const seed of seeds) {
      expect(wanderingPosition(seed, 1000, 800, { top: 0, bottom: 0 })).toEqual(
        wanderingPosition(seed, 1000, 800),
      );
    }
  });

  it('stays in the band it is given, with the same x as without it', () => {
    for (const seed of seeds) {
      const [x, y] = wanderingPosition(seed, 1000, 800, { top: 200, bottom: 80 });
      expect(y).toBeGreaterThanOrEqual(200);
      expect(y).toBeLessThanOrEqual(800 - 80);
      expect(x).toBe(wanderingPosition(seed, 1000, 800)[0]);
    }
  });

  it('survives a band with no room', () => {
    const [, y] = wanderingPosition('a', 1000, 100, { top: 200, bottom: 80 });
    expect(y).toBe(200);
  });
});

describe('gridPlacements', () => {
  it('uses the default insets when none are given', () => {
    expect(gridPlacements(7, 1280, 800)).toEqual(
      gridPlacements(7, 1280, 800, { top: 80, bottom: 112 }),
    );
  });

  it('with a taller top inset, puts every figure below it', () => {
    for (const count of [1, 3, 7, 18]) {
      const boxes = gridPlacements(count, 1280, 800, { top: 220, bottom: 112 });
      expect(boxes).toHaveLength(count);
      for (const box of boxes) {
        expect(box.y).toBeGreaterThanOrEqual(220);
        expect(box.y + box.size).toBeLessThanOrEqual(800 - 112);
      }
    }
  });
});
