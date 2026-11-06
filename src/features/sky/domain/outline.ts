import type { Point } from './types';

/**
 * A soft outline around a constellation's stars, for a shape that has no
 * hand-drawn atlas art (a generated "wild" constellation, or a catalogue shape
 * whose art is not drawn yet): the convex hull of its points, pushed outward by
 * `pad` and smoothed into a closed curve, in the unit square like the shape.
 *
 * Pure and deterministic. Returns an SVG path using only M, C and Z, so it can
 * be scaled to pixels with `pathToPixels` like the hand-drawn art.
 */

const round = (n: number): number => Math.round(n * 1000) / 1000;

const cross = (o: Point, a: Point, b: Point): number =>
  (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** Andrew's monotone chain: the hull in order, with no collinear points kept. */
const hull = (points: readonly Point[]): Point[] => {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const unique = sorted.filter(
    (p, i) => i === 0 || p[0] !== sorted[i - 1]![0] || p[1] !== sorted[i - 1]![1],
  );
  if (unique.length < 3) return unique;
  const build = (list: readonly Point[]): Point[] => {
    const out: Point[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, p) <= 0)
        out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...build(unique), ...build([...unique].reverse())];
};

const centroid = (points: readonly Point[]): Point => [
  points.reduce((s, p) => s + p[0], 0) / points.length,
  points.reduce((s, p) => s + p[1], 0) / points.length,
];

/** The polygon to smooth: the hull grown by `pad`, or a capsule/disc when it has no area. */
const polygon = (points: readonly Point[], pad: number): Point[] => {
  const h = hull(points);
  if (h.length >= 3) {
    const c = centroid(h);
    return h.map((p): Point => {
      const dx = p[0] - c[0];
      const dy = p[1] - c[1];
      const d = Math.hypot(dx, dy) || 1;
      return [p[0] + (dx / d) * pad, p[1] + (dy / d) * pad];
    });
  }
  const a = h[0] ?? ([0.5, 0.5] as Point);
  const b = h[1] ?? a;
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  // A direction along the segment (or any, for a single point) and the one across it.
  const t: Point = length === 0 ? [1, 0] : [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
  const n: Point = [-t[1], t[0]];
  const at = (p: Point, along: number, across: number): Point => [
    p[0] + t[0] * along + n[0] * across,
    p[1] + t[1] * along + n[1] * across,
  ];
  return [
    at(a, -pad, 0),
    at(a, 0, -pad),
    at(b, 0, -pad),
    at(b, pad, 0),
    at(b, 0, pad),
    at(a, 0, pad),
  ];
};

export const figureOutline = (points: readonly Point[], pad = 0.06): string => {
  const poly = polygon(points, pad);
  const n = poly.length;
  const pt = (i: number): Point => poly[((i % n) + n) % n]!;
  const f = (p: Point): string => `${round(p[0])} ${round(p[1])}`;

  // Closed Catmull-Rom spline, written as cubic Béziers through every vertex.
  let d = `M${f(pt(0))}`;
  for (let i = 0; i < n; i++) {
    const p0 = pt(i - 1);
    const p1 = pt(i);
    const p2 = pt(i + 1);
    const p3 = pt(i + 2);
    const c1: Point = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Point = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f(c1)} ${f(c2)} ${f(p2)}`;
  }
  return `${d}Z`;
};
