import { describe, expect, it } from 'vitest';

import { ATLAS_ART } from './atlasArt';
import { parsePath, samplePath } from './atlasPath';
import { CATALOGUE, catalogueEntry, type CatalogueEntry, type CatalogueKey } from './catalogue';

const keys = Object.keys(CATALOGUE) as CatalogueKey[];
const entry = (k: CatalogueKey) => catalogueEntry(k) as CatalogueEntry;

const box = (points: readonly (readonly [number, number])[]) => ({
  minX: Math.min(...points.map((p) => p[0])),
  maxX: Math.max(...points.map((p) => p[0])),
  minY: Math.min(...points.map((p) => p[1])),
  maxY: Math.max(...points.map((p) => p[1])),
});

describe('the atlas art', () => {
  it('draws every catalogue shape, the packs included, and nothing that is not one', () => {
    // The type already demands a drawing per key; this also catches a stale extra one.
    expect(Object.keys(ATLAS_ART).sort()).toEqual([...keys].sort());
  });

  it.each(keys)('%s is written in the path language', (k) => {
    const art = ATLAS_ART[k];
    expect(art.paths.length).toBeGreaterThan(0);
    for (const d of art.paths) expect(() => parsePath(d)).not.toThrow();
  });

  it.each(keys)('%s stays inside the unit square', (k) => {
    for (const d of ATLAS_ART[k].paths) {
      for (const [x, y] of samplePath(d)) {
        expect(x).toBeGreaterThanOrEqual(-0.05);
        expect(x).toBeLessThanOrEqual(1.05);
        expect(y).toBeGreaterThanOrEqual(-0.05);
        expect(y).toBeLessThanOrEqual(1.05);
      }
    }
  });

  it.each(keys)('%s covers its stars, and leaves none floating clear of a line', (k) => {
    const lines = ATLAS_ART[k].paths.flatMap((d) => samplePath(d));
    const art = box(lines);
    const stars = box(entry(k).shape.points);
    // Not a drawing of something else, nor the same thing mirrored or off to one side.
    expect((art.maxX - art.minX) / (stars.maxX - stars.minX)).toBeGreaterThanOrEqual(0.9);
    expect((art.maxY - art.minY) / (stars.maxY - stars.minY)).toBeGreaterThanOrEqual(0.9);
    // Every star sits on or beside the drawing.
    for (const [sx, sy] of entry(k).shape.points) {
      const nearest = Math.min(...lines.map(([x, y]) => Math.hypot(x - sx, y - sy)));
      expect(nearest, `${k}: star at ${String(sx)},${String(sy)}`).toBeLessThanOrEqual(0.12);
    }
  });

  it('draws nothing twice within a shape', () => {
    for (const k of keys) {
      const paths: readonly string[] = ATLAS_ART[k].paths;
      expect(new Set(paths).size).toBe(paths.length);
    }
  });
});
