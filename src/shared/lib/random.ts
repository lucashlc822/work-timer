/**
 * Seeded randomness.
 *
 * Everything procedural in the app — a star's colour, a generated
 * constellation, the ambient starfield — is a pure function of a seed string.
 * That is what lets a star be stored as a few bytes and still render
 * identically on every device, forever. `Math.random` must never be used for
 * anything that is drawn.
 */

/** A source of uniform floats in [0, 1). */
export type Rng = () => number;

/**
 * 32-bit hash of a string: FNV-1a, finished with the murmur3 avalanche so that
 * seeds differing by one character land far apart.
 */
export const hashSeed = (input: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
};

/**
 * Mulberry32: tiny, fast, and statistically fine for visuals. The same
 * algorithm as `scripts/generate-icons.mjs`, which cannot import TypeScript.
 */
export const mulberry32 = (seed: number): Rng => {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * A generator for one purpose. Namespace the seed (`star:<seed>`,
 * `shape:<seed>`) so two uses of the same session seed stay independent.
 */
export const rngFromSeed = (seed: string): Rng => mulberry32(hashSeed(seed));

/** Uniform float in [min, max). */
export const between = (rng: Rng, min: number, max: number): number => min + rng() * (max - min);

/** Uniform integer in [min, max], inclusive. */
export const intBetween = (rng: Rng, min: number, max: number): number =>
  min + Math.floor(rng() * (max - min + 1));

/** One element, uniformly. The array must be non-empty. */
export const pick = <T>(rng: Rng, items: readonly T[]): T =>
  items[Math.floor(rng() * items.length)] as T;
