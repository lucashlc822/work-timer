import { describe, expect, it } from 'vitest';

import { figureFootprint, gridPlacements, wanderingPosition, type Rect } from './layout';

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

describe('wanderingPosition keeping clear of figures', () => {
  const seeds = Array.from({ length: 200 }, (_, i) => `seed-${i}`);
  const inRect = ([x, y]: [number, number], r: Rect) =>
    x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  const area = { top: 80, bottom: 112 };

  it('is the same as before when there is nothing to avoid', () => {
    for (const seed of seeds) {
      const was = wanderingPosition(seed, 1280, 800, area);
      expect(wanderingPosition(seed, 1280, 800, area, [])).toEqual(was);
      expect(wanderingPosition(seed, 1280, 800, area, undefined)).toEqual(was);
    }
  });

  it('lands outside every figure, and leaves a star that was already clear where it was', () => {
    for (const [w, h, n] of [
      [1280, 800, 8],
      [768, 1024, 8],
      [375, 812, 18],
    ] as const) {
      const avoid = gridPlacements(n, w, h).flatMap(figureFootprint);
      let moved = 0;
      for (const seed of seeds) {
        const first = wanderingPosition(seed, w, h);
        const at = wanderingPosition(seed, w, h, undefined, avoid);
        expect(
          avoid.some((r) => inRect(at, r)),
          `${seed} at ${w}`,
        ).toBe(false);
        if (avoid.some((r) => inRect(first, r))) moved += 1;
        else expect(at).toEqual(first);
      }
      // The grid covers a good part of the window, so some stars had to move.
      expect(moved).toBeGreaterThan(0);
    }
  });

  it('stays in its band, and falls back to where it first fell if nowhere is clear', () => {
    const everything: Rect = { x: 0, y: 0, w: 1280, h: 800 };
    for (const seed of seeds) {
      expect(wanderingPosition(seed, 1280, 800, area, [everything])).toEqual(
        wanderingPosition(seed, 1280, 800, area),
      );
      const [, y] = wanderingPosition(
        seed,
        1280,
        800,
        area,
        gridPlacements(8, 1280, 800).flatMap(figureFootprint),
      );
      expect(y).toBeGreaterThanOrEqual(80);
      expect(y).toBeLessThanOrEqual(800 - 112);
    }
  });
});

describe('figureFootprint', () => {
  it('covers the box and the caption under it, a star’s hit radius beyond', () => {
    const [box, caption] = figureFootprint({ x: 100, y: 100, size: 100 });
    expect(box).toEqual({ x: 88, y: 88, w: 124, h: 124 });
    expect(caption!.y).toBe(200);
    expect(caption!.x).toBeLessThan(100);
    expect(caption!.y + caption!.h).toBeGreaterThan(200 + 14 + 3 * 7);
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
