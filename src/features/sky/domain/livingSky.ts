import { LAVENDER_400, STAR_CORE } from '../../../../design-tokens.mjs';
import { between, rngFromSeed } from '@/shared/lib';

import type { NebulaPuff } from './ambient';
import { skyThemeFor } from './skyThemes';

/**
 * The sky that lives (View sky upgrade PR 7): a faint Milky Way across the
 * ambient night, an occasional shooting star, and a slight depth shift as the
 * pointer moves.
 *
 * All three are decoration drawn from their own seeds, never from the ambient
 * field's: that field is pinned by a golden fingerprint, and a new draw
 * anywhere in its stream would move every star in everyone's sky. Like the
 * field, the Milky Way keeps the same geometry in every theme and only
 * recolours; the meteors are the same schedule for everyone.
 *
 * Pure, so the awkward parts (a schedule that must never bunch up, a band that
 * must not move between themes) are tested rather than eyeballed.
 */

// --- The Milky Way ------------------------------------------------------------

export interface MilkyWayGrain {
  x: number;
  y: number;
  /** In px: a grain is a point of light, whatever the window size. */
  radius: number;
  alpha: number;
  color: string;
}

export interface MilkyWay {
  /** The band direction across the sky, in radians. */
  angle: number;
  /** Soft clouds along the band, in the ambient field own units. */
  puffs: NebulaPuff[];
  /** Fine grains of starlight in the band: what makes it read as a galaxy, not a smudge. */
  grain: MilkyWayGrain[];
}

const MILKY_WAY_SEED = 'starkeep-milkyway-v1';
const PUFFS = 34;
const GRAINS = 260;
/** Rising to the right, about 29 degrees. */
const BAND_ANGLE = -0.5;
/** How far along the band it reaches from the middle, in viewport widths. */
const BAND_REACH = 0.75;

export const milkyWay = (themeKey?: string | null): MilkyWay => {
  const rng = rngFromSeed(MILKY_WAY_SEED);
  const theme = skyThemeFor(themeKey);
  // The band is the theme star light with a wash of its first cloud hue.
  const glow = theme.starPalette?.core ?? STAR_CORE;
  const tint = theme.cloudHues?.[0] ?? LAVENDER_400;
  const cos = Math.cos(BAND_ANGLE);
  const sin = Math.sin(BAND_ANGLE);

  // A point along the band and a little across it. Every draw is made whatever
  // the theme, so the geometry never moves between themes.
  const along = (spread: number) => {
    const s = between(rng, -BAND_REACH, BAND_REACH);
    const across = (rng() + rng() - 1) * spread;
    const falloff = 1 - 0.55 * (Math.abs(s) / BAND_REACH);
    return {
      x: 0.5 + s * cos - across * sin,
      y: 0.5 + s * sin * 0.8 + across * cos,
      falloff,
    };
  };

  const puffs: NebulaPuff[] = [];
  for (let i = 0; i < PUFFS; i += 1) {
    const p = along(0.08);
    puffs.push({
      x: p.x,
      y: p.y,
      radius: between(rng, 0.06, 0.13),
      color: i % 3 === 0 ? tint : glow,
      alpha: between(rng, 0.03, 0.065) * p.falloff,
    });
  }

  const grain: MilkyWayGrain[] = [];
  for (let i = 0; i < GRAINS; i += 1) {
    const p = along(0.05);
    grain.push({
      x: p.x,
      y: p.y,
      radius: between(rng, 0.4, 1.1),
      alpha: between(rng, 0.2, 0.65) * p.falloff,
      color: glow,
    });
  }
  return { angle: BAND_ANGLE, puffs, grain };
};

// --- Shooting stars ---------------------------------------------------------

/** One shooting star in the schedule. Positions are fractions of the window; a path is in widths. */
export interface MeteorEvent {
  startMs: number;
  durationMs: number;
  /** Where it starts, as a fraction of the width and height. */
  x: number;
  y: number;
  /** The whole path, in fractions of the window width so the angle is true on any shape. */
  dx: number;
  dy: number;
}

/** A shooting star in flight: its path and how far along it is. */
export interface Meteor extends MeteorEvent {
  /** 0 as it appears, 1 as it ends. */
  t: number;
  /** 0 to 1, fading in and out. */
  alpha: number;
}

const METEOR_SEED = 'starkeep-meteors-v1';
/** The first is never sooner than this after the sky opens; then a minute or so apart. */
const FIRST_MIN_MS = 20_000;
const FIRST_MAX_MS = 60_000;
const GAP_MIN_MS = 45_000;
const GAP_MAX_MS = 120_000;

// One stream, extended on demand and only ever forward, so what meteorAt(t)
// answers never depends on what was asked before it.
const meteorRng = rngFromSeed(METEOR_SEED);
const schedule: MeteorEvent[] = [];

const extendTo = (ms: number): void => {
  while ((schedule.at(-1)?.startMs ?? -1) <= ms) {
    const last = schedule.at(-1);
    const startMs =
      last === undefined
        ? between(meteorRng, FIRST_MIN_MS, FIRST_MAX_MS)
        : last.startMs + last.durationMs + between(meteorRng, GAP_MIN_MS, GAP_MAX_MS);
    const durationMs = between(meteorRng, 700, 1100);
    // Across the upper sky, falling 20 to 40 degrees, left to right or right to left.
    const angle = (between(meteorRng, 20, 40) * Math.PI) / 180;
    const length = between(meteorRng, 0.14, 0.24);
    const sign = meteorRng() < 0.5 ? -1 : 1;
    schedule.push({
      startMs,
      durationMs,
      x: between(meteorRng, 0.12, 0.88),
      y: between(meteorRng, 0.03, 0.45),
      dx: sign * Math.cos(angle) * length,
      dy: Math.sin(angle) * length,
    });
  }
};

/** The first count shooting stars, in order: for tests, and nothing else. */
export const meteorSchedule = (count: number): MeteorEvent[] => {
  while (schedule.length < count) extendTo((schedule.at(-1)?.startMs ?? 0) + 1);
  return schedule.slice(0, count);
};

/**
 * The shooting star in flight elapsedMs after the sky opened, or null. Never
 * at 0, and never more than one at a time: they are a minute or so apart.
 */
export const meteorAt = (elapsedMs: number): Meteor | null => {
  if (elapsedMs < FIRST_MIN_MS) return null;
  extendTo(elapsedMs);
  const event = schedule.find(
    (e) => elapsedMs >= e.startMs && elapsedMs <= e.startMs + e.durationMs,
  );
  if (event === undefined) return null;
  const t = (elapsedMs - event.startMs) / event.durationMs;
  return { ...event, t, alpha: Math.sin(Math.PI * t) };
};

/** A shooting star as a line on screen: where its bright head is, and where its tail ends. */
export interface MeteorSegment {
  head: [number, number];
  tail: [number, number];
}

/** How much of its path a shooting star tail trails behind it. */
export const METEOR_TRAIL = 0.45;

export const meteorSegment = (m: Meteor, width: number, height: number): MeteorSegment => {
  const at = (t: number): [number, number] => [
    m.x * width + m.dx * width * t,
    m.y * height + m.dy * width * t,
  ];
  return { head: at(m.t), tail: at(Math.max(0, m.t - METEOR_TRAIL)) };
};

// --- Depth on pointer movement ----------------------------------------------

/** How far, in px, the pointer moves each ambient layer at the window edge; nearer layers move more. */
export const PARALLAX_PX = [1.5, 4, 8] as const;
/** The nebula and the Milky Way barely move: they are the farthest thing there is. */
export const PARALLAX_NEBULA_PX = 1;
/** How much of the remaining distance each frame closes, so movement glides. */
export const PARALLAX_EASE = 0.08;

/** Where the pointer is, from -1 (left or top) to 1 (right or bottom), clamped. */
export const pointerOffset = (pointer: number, extent: number): number =>
  extent <= 0 ? 0 : Math.max(-1, Math.min(1, (pointer / extent) * 2 - 1));

/** One frame of gliding current toward target. */
export const easeToward = (current: number, target: number, ease = PARALLAX_EASE): number => {
  const next = current + (target - current) * ease;
  return Math.abs(target - next) < 0.001 ? target : next;
};
