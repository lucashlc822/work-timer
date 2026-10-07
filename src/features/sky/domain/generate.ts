import { intBetween, pick, rngFromSeed, type Rng } from '@/shared/lib';

import { TIERS } from './tiers';
import type { Point, ShapeDef, Tier } from './types';

/**
 * Generated ("wild") constellations.
 *
 * A seed becomes a shape through constrained randomness, so the result reads
 * as a constellation rather than a scatter plot:
 *
 * 1. **Points** by dart-throwing with a minimum spacing (a cheap Poisson-disk
 *    sample), so no two stars crowd each other.
 * 2. **Lines** from the Euclidean minimum spanning tree — the shortest set of
 *    lines that connects everything. It is always planar, which is most of
 *    what makes real constellation figures look natural.
 * 3. **A loop or two** for richer tiers: the shortest extra edges that cross
 *    nothing and are not much longer than a typical tree edge.
 *
 * Candidates are rejected (and redrawn from the same RNG stream) if a star has
 * more than three lines, an extra edge crosses another, or the figure is too
 * cramped to read. After `MAX_ATTEMPTS` the generator falls back to a gentle
 * arc, so it always returns a usable shape.
 */

const MAX_ATTEMPTS = 50;
const MARGIN = 0.06;
const MIN_SPAN = 0.45;
const MAX_DEGREE = 3;

const EXTRA_EDGES: Record<Tier, readonly [number, number]> = {
  easy: [0, 0],
  medium: [0, 1],
  hard: [1, 2],
};

type Edge = [number, number];

const dist = (a: Point, b: Point): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

const orientation = (a: Point, b: Point, c: Point): number =>
  Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));

/** True if the segments cross properly. Segments sharing an endpoint never count. */
export const segmentsCross = (p: Point, q: Point, r: Point, s: Point): boolean =>
  orientation(p, q, r) * orientation(p, q, s) < 0 &&
  orientation(r, s, p) * orientation(r, s, q) < 0;

const samplePoints = (rng: Rng, n: number): Point[] | null => {
  const minDist = 0.55 / Math.sqrt(n);
  const points: Point[] = [];
  let darts = 0;
  while (points.length < n) {
    if ((darts += 1) > n * 300) return null;
    const candidate: Point = [MARGIN + rng() * (1 - 2 * MARGIN), MARGIN + rng() * (1 - 2 * MARGIN)];
    if (points.every((p) => dist(p, candidate) >= minDist)) points.push(candidate);
  }
  return points;
};

/** Prim's algorithm. O(n²), which is nothing at n ≤ 16. */
const minimumSpanningTree = (points: readonly Point[]): Edge[] => {
  const inTree = new Set<number>([0]);
  const edges: Edge[] = [];
  while (inTree.size < points.length) {
    let best: Edge | null = null;
    let bestLength = Infinity;
    for (const i of inTree) {
      for (let j = 0; j < points.length; j += 1) {
        if (inTree.has(j)) continue;
        const length = dist(points[i]!, points[j]!);
        if (length < bestLength) {
          bestLength = length;
          best = [i, j];
        }
      }
    }
    edges.push(best!);
    inTree.add(best![1]);
  }
  return edges;
};

const degrees = (n: number, edges: readonly Edge[]): number[] => {
  const deg = new Array<number>(n).fill(0);
  for (const [a, b] of edges) {
    deg[a]! += 1;
    deg[b]! += 1;
  }
  return deg;
};

const crossesAny = (points: readonly Point[], edges: readonly Edge[], [a, b]: Edge): boolean =>
  edges.some(
    ([c, d]) =>
      a !== c &&
      a !== d &&
      b !== c &&
      b !== d &&
      segmentsCross(points[a]!, points[b]!, points[c]!, points[d]!),
  );

const addExtraEdges = (rng: Rng, points: readonly Point[], tree: Edge[], tier: Tier): Edge[] => {
  const [min, max] = EXTRA_EDGES[tier];
  const wanted = intBetween(rng, min, max);
  if (wanted === 0) return tree;

  const treeLengths = tree.map(([a, b]) => dist(points[a]!, points[b]!)).sort((x, y) => x - y);
  const median = treeLengths[Math.floor(treeLengths.length / 2)]!;
  const has = new Set(tree.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`));

  const candidates: Edge[] = [];
  for (let a = 0; a < points.length; a += 1) {
    for (let b = a + 1; b < points.length; b += 1) {
      if (!has.has(`${a}-${b}`)) candidates.push([a, b]);
    }
  }
  candidates.sort(
    (e, f) => dist(points[e[0]]!, points[e[1]]!) - dist(points[f[0]]!, points[f[1]]!),
  );

  const edges = [...tree];
  for (const candidate of candidates) {
    if (edges.length - tree.length >= wanted) break;
    if (dist(points[candidate[0]]!, points[candidate[1]]!) > median * 1.8) break;
    const deg = degrees(points.length, edges);
    if (deg[candidate[0]]! >= MAX_DEGREE || deg[candidate[1]]! >= MAX_DEGREE) continue;
    if (crossesAny(points, edges, candidate)) continue;
    edges.push(candidate);
  }
  return edges;
};

/**
 * Reorder points into growth order: a depth-first walk of the spanning tree,
 * starting from its leftmost leaf, so each star's tree parent precedes it.
 */
const toGrowthOrder = (
  points: readonly Point[],
  tree: readonly Edge[],
  all: readonly Edge[],
): ShapeDef => {
  const neighbours = points.map(() => [] as number[]);
  for (const [a, b] of tree) {
    neighbours[a]!.push(b);
    neighbours[b]!.push(a);
  }
  // Visit nearer-left neighbours first, so the order is stable and readable.
  for (const list of neighbours) list.sort((i, j) => points[i]![0] - points[j]![0]);

  const leaves = points.map((_, i) => i).filter((i) => neighbours[i]!.length === 1);
  const root = (leaves.length > 0 ? leaves : [0]).reduce((best, i) =>
    points[i]![0] < points[best]![0] ? i : best,
  );

  const order: number[] = [];
  const seen = new Set<number>();
  const visit = (i: number) => {
    seen.add(i);
    order.push(i);
    for (const j of neighbours[i]!) if (!seen.has(j)) visit(j);
  };
  visit(root);

  const newIndex = new Map(order.map((oldIndex, i) => [oldIndex, i]));
  return {
    points: order.map((i) => points[i]!),
    edges: all.map(([a, b]) => [newIndex.get(a)!, newIndex.get(b)!] as const),
  };
};

const span = (points: readonly Point[]): [number, number] => {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
};

/** A gentle arc: always valid, used only if every attempt was rejected. */
const fallbackArc = (n: number): ShapeDef => ({
  points: Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    return [0.1 + 0.8 * t, 0.7 - 0.4 * Math.sin(Math.PI * t)] as const;
  }),
  edges: Array.from({ length: n - 1 }, (_, i) => [i, i + 1] as const),
});

export const generateShape = (seed: string, tier: Tier): ShapeDef => {
  const rng = rngFromSeed(`shape:${seed}`);
  const [minStars, maxStars] = TIERS[tier].stars;
  const n = intBetween(rng, minStars, maxStars);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const points = samplePoints(rng, n);
    if (points === null) continue;

    const [width, height] = span(points);
    if (width < MIN_SPAN || height < MIN_SPAN) continue;

    const tree = minimumSpanningTree(points);
    if (Math.max(...degrees(n, tree)) > MAX_DEGREE) continue;

    const edges = addExtraEdges(rng, points, tree, tier);
    return toGrowthOrder(points, tree, edges);
  }

  return fallbackArc(n);
};

const ADJECTIVES = [
  'Quiet',
  'Patient',
  'Drifting',
  'Lantern-lit',
  'Sleeping',
  'Wandering',
  'Silver',
  'Gentle',
  'Hidden',
  'Faraway',
  'Dreaming',
  'Steady',
  'Hushed',
  'Rising',
  'Soft',
  'Lonely',
  'Glimmering',
  'Northern',
  'Midnight',
  'Tidal',
] as const;

const NOUNS = [
  'Heron',
  'Fox',
  'Lantern',
  'Moth',
  'Sparrow',
  'Orchard',
  'Kettle',
  'Willow',
  'Otter',
  'Comet',
  'Thimble',
  'Lighthouse',
  'Owl',
  'Ferry',
  'Garden',
  'Compass',
  'Hare',
  'Teapot',
  'Bell',
  'Feather',
] as const;

export const generateName = (seed: string): string => {
  const rng = rngFromSeed(`name:${seed}`);
  return `The ${pick(rng, ADJECTIVES)} ${pick(rng, NOUNS)}`;
};
