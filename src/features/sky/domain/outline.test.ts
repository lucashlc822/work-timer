import { describe, expect, it } from 'vitest';

import { parsePath, samplePath } from './atlasPath';
import { CATALOGUE } from './catalogue';
import { generateShape } from './generate';
import { figureOutline } from './outline';
import type { Point } from './types';

/** Even-odd point in polygon. */
const inside = (poly: readonly [number, number][], [px, py]: Point): boolean => {
  let isIn = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) isIn = !isIn;
  }
  return isIn;
};

const SQUARE: Point[] = [
  [0.2, 0.2],
  [0.8, 0.2],
  [0.8, 0.8],
  [0.2, 0.8],
  [0.5, 0.5],
];

describe('figureOutline', () => {
  it('is deterministic', () => {
    expect(figureOutline(SQUARE)).toBe(figureOutline(SQUARE));
  });

  it('uses only M, C and Z: one closed loop', () => {
    const commands = parsePath(figureOutline(SQUARE)).map((s) => s.command);
    expect(commands[0]).toBe('M');
    expect(commands.at(-1)).toBe('Z');
    expect(commands.slice(1, -1).every((c) => c === 'C')).toBe(true);
  });

  it('encloses every point, with room to spare', () => {
    const outline = samplePath(figureOutline(SQUARE), 16);
    for (const p of SQUARE) expect(inside(outline, p)).toBe(true);
  });

  it('encloses the stars of every catalogue shape', () => {
    for (const [key, entry] of Object.entries(CATALOGUE)) {
      const outline = samplePath(figureOutline(entry.shape.points), 16);
      for (const p of entry.shape.points)
        expect(inside(outline, p), `${key} ${p.join(',')}`).toBe(true);
    }
  });

  it('encloses the stars of generated shapes at every tier', () => {
    for (const tier of ['easy', 'medium', 'hard'] as const) {
      for (const seed of ['a', 'b', 'c', 'd', 'e']) {
        const shape = generateShape(seed, tier);
        const outline = samplePath(figureOutline(shape.points), 16);
        for (const p of shape.points)
          expect(inside(outline, p), `${tier} ${seed} ${p.join(',')}`).toBe(true);
      }
    }
  });

  it('makes a capsule round two points, a line of points, or a single one, never NaN', () => {
    const cases: Point[][] = [
      [
        [0.2, 0.5],
        [0.8, 0.5],
      ],
      [
        [0.1, 0.1],
        [0.3, 0.3],
        [0.5, 0.5],
        [0.9, 0.9],
      ],
      [[0.5, 0.5]],
      [
        [0.5, 0.5],
        [0.5, 0.5],
      ],
    ];
    for (const points of cases) {
      const d = figureOutline(points);
      expect(d).not.toMatch(/NaN|Infinity/);
      const outline = samplePath(d, 16);
      expect(outline.length).toBeGreaterThan(8);
      for (const p of points) expect(inside(outline, p)).toBe(true);
    }
  });

  it('grows with the padding', () => {
    const width = (pad: number) => {
      const xs = samplePath(figureOutline(SQUARE, pad), 16).map((p) => p[0]);
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(width(0.1)).toBeGreaterThan(width(0.03));
  });
});
