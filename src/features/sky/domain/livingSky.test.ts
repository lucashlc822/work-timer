import { describe, expect, it } from 'vitest';

import { hashSeed } from '@/shared/lib';

import {
  easeToward,
  meteorAt,
  meteorSchedule,
  meteorSegment,
  METEOR_TRAIL,
  milkyWay,
  PARALLAX_EASE,
  PARALLAX_PX,
  pointerOffset,
} from './livingSky';
import { SKY_THEMES } from './skyThemes';

const round = (n: number) => Math.round(n * 1e6) / 1e6;

/** Where everything in the band sits, with no colour: what must not move between themes. */
const geometry = (key?: string | null) => {
  const m = milkyWay(key);
  return JSON.stringify({
    a: m.angle,
    p: m.puffs.map((p) => [round(p.x), round(p.y), round(p.radius), round(p.alpha)]),
    g: m.grain.map((g) => [round(g.x), round(g.y), round(g.radius), round(g.alpha)]),
  });
};

// Captured when Lucas approved the Milky Way (View sky upgrade PR 7). If these
// change, the band moves for everyone.
const GOLDEN_BAND = {
  geometryHash: 3987046443,
  fullHash: 247207814,
  puffs: 34,
  grain: 260,
  first: {
    x: 0.370746,
    y: 0.592722,
    radius: 0.10968,
    color: '#ab93e6',
    alpha: 0.055246,
  },
};

const GOLDEN_METEORS = [
  { s: 47005, d: 967, x: 0.792565, y: 0.325814, dx: -0.160475, dy: 0.106125 },
  { s: 129272, d: 828, x: 0.76789, y: 0.123749, dx: 0.177257, dy: 0.073081 },
  { s: 192312, d: 748, x: 0.261095, y: 0.089369, dx: -0.128706, dy: 0.079932 },
  { s: 258345, d: 889, x: 0.453455, y: 0.186728, dx: -0.187723, dy: 0.120348 },
  { s: 345920, d: 1081, x: 0.35937, y: 0.38901, dx: -0.173443, dy: 0.142177 },
];

describe('the Milky Way', () => {
  it('is the band that was approved', () => {
    const m = milkyWay('night');
    expect(hashSeed(geometry('night'))).toBe(GOLDEN_BAND.geometryHash);
    expect(hashSeed(JSON.stringify(m))).toBe(GOLDEN_BAND.fullHash);
    expect(m.puffs).toHaveLength(GOLDEN_BAND.puffs);
    expect(m.grain).toHaveLength(GOLDEN_BAND.grain);
    const first = m.puffs[0]!;
    expect({
      x: round(first.x),
      y: round(first.y),
      radius: round(first.radius),
      color: first.color,
      alpha: round(first.alpha),
    }).toEqual(GOLDEN_BAND.first);
  });

  it('is deterministic', () => {
    expect(milkyWay('night')).toEqual(milkyWay('night'));
  });

  it('sits in exactly the same place in every theme, and only changes colour', () => {
    const night = geometry('night');
    for (const key of Object.keys(SKY_THEMES)) expect(geometry(key)).toBe(night);
    // It is a different colour in a theme that has its own, so it is not merely the same band.
    expect(JSON.stringify(milkyWay('dusk'))).not.toBe(JSON.stringify(milkyWay('night')));
    expect(JSON.stringify(milkyWay('tide'))).not.toBe(JSON.stringify(milkyWay('dusk')));
  });

  it('draws as night for an unknown, null or absent theme', () => {
    for (const key of ['from-the-future', '', null, undefined]) {
      expect(milkyWay(key)).toEqual(milkyWay('night'));
    }
  });

  it('uses the night star light and lavender, and a theme own light and first cloud hue', () => {
    expect(new Set(milkyWay('night').puffs.map((p) => p.color))).toEqual(
      new Set(['#fffdf8', '#ab93e6']),
    );
    const tide = SKY_THEMES['tide']!;
    expect(new Set(milkyWay('tide').puffs.map((p) => p.color))).toEqual(
      new Set([tide.starPalette!.core, tide.cloudHues![0]]),
    );
  });

  it('is faint, a band across the sky, and made of real values', () => {
    const m = milkyWay('night');
    for (const p of m.puffs) {
      expect(p.alpha).toBeGreaterThan(0);
      expect(p.alpha).toBeLessThan(0.07);
      expect(p.radius).toBeGreaterThan(0);
    }
    for (const g of m.grain) {
      expect(g.alpha).toBeGreaterThan(0);
      expect(g.alpha).toBeLessThanOrEqual(0.65);
      expect(g.radius).toBeGreaterThan(0);
      expect(g.radius).toBeLessThan(2);
    }
    // It runs up and to the right: the right-hand grains sit higher than the left-hand ones.
    const left = m.grain.filter((g) => g.x < 0.3);
    const right = m.grain.filter((g) => g.x > 0.7);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(right.map((g) => g.y))).toBeLessThan(mean(left.map((g) => g.y)));
    expect(m.angle).toBeLessThan(0);
  });
});

describe('the shooting stars', () => {
  it('are the schedule that was approved', () => {
    const got = meteorSchedule(5).map((e) => ({
      s: Math.round(e.startMs),
      d: Math.round(e.durationMs),
      x: round(e.x),
      y: round(e.y),
      dx: round(e.dx),
      dy: round(e.dy),
    }));
    expect(got).toEqual(GOLDEN_METEORS);
  });

  it('never appear the moment a sky opens, or in its first 20 seconds', () => {
    expect(meteorAt(0)).toBeNull();
    expect(meteorAt(1)).toBeNull();
    expect(meteorAt(19_999)).toBeNull();
    expect(meteorSchedule(1)[0]!.startMs).toBeGreaterThanOrEqual(20_000);
  });

  it('are a minute or so apart, never bunched up, and brief', () => {
    const events = meteorSchedule(40);
    for (let i = 0; i < events.length; i++) {
      const e = events[i]!;
      expect(e.durationMs).toBeGreaterThanOrEqual(700);
      expect(e.durationMs).toBeLessThanOrEqual(1100);
      if (i > 0) {
        const prev = events[i - 1]!;
        const gap = e.startMs - (prev.startMs + prev.durationMs);
        expect(gap).toBeGreaterThanOrEqual(45_000);
        expect(gap).toBeLessThanOrEqual(120_000);
      }
    }
  });

  it('start in the upper sky and fall 20 to 40 degrees, either way across it', () => {
    const events = meteorSchedule(40);
    for (const e of events) {
      expect(e.y).toBeGreaterThanOrEqual(0.03);
      expect(e.y).toBeLessThanOrEqual(0.45);
      expect(e.x).toBeGreaterThanOrEqual(0.12);
      expect(e.x).toBeLessThanOrEqual(0.88);
      const degrees = (Math.atan2(e.dy, Math.abs(e.dx)) * 180) / Math.PI;
      expect(degrees).toBeGreaterThanOrEqual(20 - 1e-9);
      expect(degrees).toBeLessThanOrEqual(40 + 1e-9);
      expect(e.dy).toBeGreaterThan(0); // always falling
    }
    expect(events.some((e) => e.dx < 0)).toBe(true);
    expect(events.some((e) => e.dx > 0)).toBe(true);
  });

  it('are in flight exactly while their time lasts, fading in and out', () => {
    const [first] = meteorSchedule(1);
    const { startMs, durationMs } = first!;

    expect(meteorAt(startMs - 1)).toBeNull();
    const start = meteorAt(startMs)!;
    expect(start.t).toBe(0);
    expect(start.alpha).toBeCloseTo(0, 9);

    const middle = meteorAt(startMs + durationMs / 2)!;
    expect(middle.t).toBeCloseTo(0.5, 9);
    expect(middle.alpha).toBeCloseTo(1, 9);

    const end = meteorAt(startMs + durationMs)!;
    expect(end.t).toBeCloseTo(1, 9);
    expect(end.alpha).toBeCloseTo(0, 6);
    expect(meteorAt(startMs + durationMs + 1)).toBeNull();
  });

  it('are the same whatever order they are asked about in', () => {
    const late = meteorSchedule(30).at(-1)!;
    const asked = meteorAt(late.startMs + 100);
    // Ask for something early after something late: the schedule must not have moved.
    expect(meteorAt(meteorSchedule(1)[0]!.startMs + 100)).not.toBeNull();
    expect(meteorAt(late.startMs + 100)).toEqual(asked);
    expect(meteorSchedule(5).map((e) => Math.round(e.startMs))).toEqual(
      GOLDEN_METEORS.map((e) => e.s),
    );
  });

  it('are null between one and the next, however long the window was hidden', () => {
    const a = meteorSchedule(2)[0]!;
    const b = meteorSchedule(2)[1]!;
    const between = (a.startMs + a.durationMs + b.startMs) / 2;
    expect(meteorAt(between)).toBeNull();
    // A jump of half an hour lands on at most one, never a burst.
    expect(meteorAt(1_800_000)?.t ?? 0).toBeLessThanOrEqual(1);
  });

  it('are drawn as a head and a tail on screen, in true angles on any window shape', () => {
    const m = meteorAt(meteorSchedule(1)[0]!.startMs + meteorSchedule(1)[0]!.durationMs * 0.8)!;
    for (const [w, h] of [
      [1000, 600],
      [480, 720],
    ] as const) {
      const { head, tail } = meteorSegment(m, w, h);
      const angle = (Math.atan2(head[1] - tail[1], Math.abs(head[0] - tail[0])) * 180) / Math.PI;
      expect(angle).toBeGreaterThanOrEqual(20 - 1e-6);
      expect(angle).toBeLessThanOrEqual(40 + 1e-6);
    }
    const { head, tail } = meteorSegment(m, 1000, 600);
    const length = Math.hypot(head[0] - tail[0], head[1] - tail[1]);
    // The tail is the trailing share of the path behind the head.
    expect(length).toBeCloseTo(Math.hypot(m.dx, m.dy) * 1000 * Math.min(METEOR_TRAIL, m.t), 6);
  });

  it('start the tail at the beginning of the path when only just begun', () => {
    const e = meteorSchedule(1)[0]!;
    const m = meteorAt(e.startMs + e.durationMs * 0.1)!;
    const { tail } = meteorSegment(m, 1000, 600);
    expect(tail[0]).toBeCloseTo(e.x * 1000, 6);
    expect(tail[1]).toBeCloseTo(e.y * 600, 6);
  });
});

describe('the depth shift', () => {
  it('moves nearer layers further than far ones, a few pixels at most', () => {
    expect([...PARALLAX_PX]).toEqual([1.5, 4, 8]);
    expect(PARALLAX_PX[0]).toBeLessThan(PARALLAX_PX[1]);
    expect(PARALLAX_PX[1]).toBeLessThan(PARALLAX_PX[2]);
  });

  it('reads the pointer from -1 at one edge to 1 at the other, and clamps beyond', () => {
    expect(pointerOffset(0, 1000)).toBe(-1);
    expect(pointerOffset(500, 1000)).toBe(0);
    expect(pointerOffset(1000, 1000)).toBe(1);
    expect(pointerOffset(-50, 1000)).toBe(-1);
    expect(pointerOffset(5000, 1000)).toBe(1);
    expect(pointerOffset(10, 0)).toBe(0);
  });

  it('glides toward its target and arrives, never overshooting', () => {
    let at = 0;
    const seen: number[] = [];
    for (let i = 0; i < 200; i++) {
      at = easeToward(at, 1);
      seen.push(at);
      expect(at).toBeLessThanOrEqual(1);
    }
    expect(seen[0]).toBeCloseTo(PARALLAX_EASE, 9);
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]!);
    expect(at).toBe(1);
    // And it glides back the other way as well.
    for (let i = 0; i < 200; i++) at = easeToward(at, -1);
    expect(at).toBe(-1);
  });
});
