import { describe, expect, it } from 'vitest';

import { hashSeed, rngFromSeed } from '@/shared/lib';

import { CATALOGUE } from './catalogue';
import { generateName, generateShape, segmentsCross } from './generate';
import { focusWeight, starAppearance } from './starAppearance';
import { TIERS } from './tiers';
import { TIER_ORDER, type ShapeDef } from './types';

/** Every point after the first shares an edge with an earlier point. */
const isGrowthOrdered = (shape: ShapeDef): boolean =>
  shape.points.every(
    (_, i) => i === 0 || shape.edges.some(([a, b]) => (a === i && b < i) || (b === i && a < i)),
  );

const hasCrossings = (shape: ShapeDef): boolean =>
  shape.edges.some(([a, b], i) =>
    shape.edges.some(
      ([c, d], j) =>
        j > i &&
        new Set([a, b, c, d]).size === 4 &&
        segmentsCross(shape.points[a]!, shape.points[b]!, shape.points[c]!, shape.points[d]!),
    ),
  );

const inUnitSquare = (shape: ShapeDef): boolean =>
  shape.points.every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1);

describe('seeded randomness', () => {
  it('hashes the same string to the same value, and nearby strings far apart', () => {
    expect(hashSeed('abc')).toBe(hashSeed('abc'));
    expect(hashSeed('abc')).not.toBe(hashSeed('abd'));
  });

  it('produces the same stream from the same seed', () => {
    const a = rngFromSeed('seed');
    const b = rngFromSeed('seed');
    const drawsA = Array.from({ length: 20 }, () => a());
    expect(Array.from({ length: 20 }, () => b())).toEqual(drawsA);
    expect(drawsA.every((v) => v >= 0 && v < 1)).toBe(true);
  });
});

// O1.1 — the same seed gives byte-identical output.
describe('determinism', () => {
  it('gives identical star appearance for the same seed and focus', () => {
    expect(starAppearance('abcdef0123456789', 1500)).toEqual(
      starAppearance('abcdef0123456789', 1500),
    );
  });

  it.each(TIER_ORDER)('gives an identical generated %s shape for the same seed', (tier) => {
    expect(JSON.stringify(generateShape('seed-42', tier))).toBe(
      JSON.stringify(generateShape('seed-42', tier)),
    );
  });

  it('gives an identical name for the same seed', () => {
    expect(generateName('seed-42')).toBe(generateName('seed-42'));
    expect(generateName('seed-42')).toMatch(/^The [A-Z][a-z-]+ [A-Z][a-z]+$/);
  });
});

describe('star appearance', () => {
  it('makes longer sessions brighter and larger', () => {
    const short = starAppearance('same-seed', 5 * 60);
    const long = starAppearance('same-seed', 3 * 60 * 60);
    expect(long.brightness).toBeGreaterThan(short.brightness);
    expect(long.radius).toBeGreaterThan(short.radius);
    expect(short.color).toBe(long.color);
  });

  it('clamps focus weight to [0, 1]', () => {
    expect(focusWeight(0)).toBe(0);
    expect(focusWeight(99 * 3600)).toBe(1);
  });

  it('returns a hex colour', () => {
    expect(starAppearance('x', 1500).color).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('the catalogue', () => {
  const entries = Object.entries(CATALOGUE);

  it.each(entries)('%s is grown in order, so a partial figure is connected', (_, entry) => {
    expect(isGrowthOrdered(entry.shape)).toBe(true);
  });

  it.each(entries)('%s has no crossing lines', (_, entry) => {
    expect(hasCrossings(entry.shape)).toBe(false);
  });

  it.each(entries)('%s has a star count inside its tier', (_, entry) => {
    const [min, max] = TIERS[entry.tier].stars;
    expect(entry.shape.points.length).toBeGreaterThanOrEqual(min);
    expect(entry.shape.points.length).toBeLessThanOrEqual(max);
    expect(inUnitSquare(entry.shape)).toBe(true);
  });

  it('offers at least one shape per tier', () => {
    for (const tier of TIER_ORDER) {
      expect(entries.some(([, e]) => e.tier === tier)).toBe(true);
    }
  });
});

describe('generated shapes', () => {
  const seeds = Array.from({ length: 200 }, (_, i) => `seed-${i}`);

  it.each(TIER_ORDER)('are always valid for %s, across 200 seeds', (tier) => {
    const [min, max] = TIERS[tier].stars;
    for (const seed of seeds) {
      const shape = generateShape(seed, tier);
      expect(shape.points.length).toBeGreaterThanOrEqual(min);
      expect(shape.points.length).toBeLessThanOrEqual(max);
      expect(isGrowthOrdered(shape)).toBe(true);
      expect(hasCrossings(shape)).toBe(false);
      expect(inUnitSquare(shape)).toBe(true);
    }
  });

  it('give harder tiers loops, which easy never has', () => {
    const loops = (tier: (typeof TIER_ORDER)[number]) =>
      seeds.map((s) => generateShape(s, tier)).filter((s) => s.edges.length >= s.points.length)
        .length;
    expect(loops('easy')).toBe(0);
    expect(loops('hard')).toBeGreaterThan(seeds.length / 2);
  });

  it('rarely needs the fallback arc', () => {
    // The fallback is a chain; a real shape almost never has every edge (i, i+1).
    const isChain = (s: ShapeDef) => s.edges.every(([a, b], i) => a === i && b === i + 1);
    const fallbacks = seeds.filter((s) => isChain(generateShape(s, 'hard'))).length;
    expect(fallbacks).toBeLessThan(seeds.length * 0.05);
  });
});
