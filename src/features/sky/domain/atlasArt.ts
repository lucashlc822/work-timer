import type { CatalogueKey } from './catalogue';

/**
 * The faint line drawings behind each constellation, like the engraved figures
 * on an old star atlas: the kite, the swan, the whale drawn around the stars
 * that make them. They fade in as the constellation fills and are fully
 * drawn once it is complete.
 *
 * Every path is in the unit square the shape's stars are in, written in the
 * path language `atlasPath.ts` reads (absolute M, L, C, Q, Z). Thin and sparse
 * on purpose: they are a whisper under the stars, not an illustration.
 *
 * Art is keyed by catalogue key, which is permanent, so a drawing may be
 * redrawn but never removed. A shape without art draws a soft outline instead.
 */
export interface AtlasFigureArt {
  paths: readonly string[];
}

export const ATLAS_ART: Partial<Readonly<Record<CatalogueKey, AtlasFigureArt>>> = {
  // A paper kite on its string: the sail, its two spars, and a tail of bows.
  kite: {
    paths: [
      'M0.5 0.04C0.64 0.15 0.87 0.3 0.87 0.38C0.87 0.46 0.64 0.6 0.5 0.77C0.36 0.6 0.13 0.46 0.13 0.38C0.13 0.3 0.36 0.15 0.5 0.04Z',
      'M0.5 0.04L0.5 0.77M0.13 0.38L0.87 0.38',
      'M0.5 0.77C0.58 0.82 0.42 0.88 0.5 0.93C0.56 0.97 0.47 0.99 0.46 1',
      'M0.54 0.82L0.58 0.85L0.54 0.88L0.5 0.85ZM0.5 0.92L0.54 0.95L0.5 0.98L0.46 0.95Z',
    ],
  },

  // An arrow in flight: a solid head, a doubled shaft, and three feathers.
  arrow: {
    paths: [
      'M0.88 0.12L0.5 0.16L0.84 0.5Z',
      'M0.5 0.16Q0.7 0.3 0.84 0.5',
      'M0.686 0.346L0.136 0.896M0.654 0.314L0.104 0.864',
      'M0.2 0.8L0.22 0.876M0.2 0.8L0.124 0.78M0.27 0.73L0.29 0.806M0.27 0.73L0.194 0.71M0.34 0.66L0.36 0.736M0.34 0.66L0.264 0.64',
    ],
  },

  // A cup on its saucer, a curl of steam above it, the handle through the last star.
  teacup: {
    paths: [
      'M0.18 0.28C0.3 0.2 0.66 0.2 0.78 0.28C0.66 0.36 0.3 0.36 0.18 0.28Z',
      'M0.18 0.28C0.2 0.5 0.22 0.7 0.28 0.76C0.36 0.84 0.6 0.84 0.68 0.76C0.74 0.7 0.76 0.5 0.78 0.28',
      'M0.14 0.9C0.3 0.86 0.66 0.86 0.82 0.9C0.66 0.96 0.3 0.96 0.14 0.9Z',
      'M0.78 0.32C0.98 0.28 1 0.52 0.95 0.52C0.9 0.6 0.8 0.68 0.7 0.7',
      'M0.4 0.14C0.36 0.1 0.44 0.06 0.4 0.02M0.55 0.14C0.51 0.1 0.59 0.06 0.55 0.02',
    ],
  },

  // A lantern: its ring, roof, ribbed cage and a small flame.
  lantern: {
    paths: [
      'M0.36 0.2C0.36 0 0.64 0 0.64 0.2',
      'M0.26 0.36Q0.5 0.04 0.74 0.36',
      'M0.26 0.36L0.26 0.76M0.74 0.36L0.74 0.76M0.5 0.28C0.38 0.44 0.38 0.66 0.5 0.84M0.5 0.28C0.62 0.44 0.62 0.66 0.5 0.84',
      'M0.5 0.46C0.44 0.54 0.46 0.62 0.5 0.64C0.54 0.62 0.56 0.54 0.5 0.46Z',
      'M0.26 0.76Q0.5 0.84 0.74 0.76M0.3 0.84Q0.5 0.92 0.7 0.84',
    ],
  },

  // A swan on the water: S-curved neck and beak, the belly, a folded wing, and ripples.
  swan: {
    paths: [
      'M0.3 0.54C0.3 0.46 0.26 0.4 0.24 0.34C0.22 0.28 0.2 0.22 0.12 0.18',
      'M0.12 0.17L0.04 0.2L0.12 0.225Z',
      'M0.3 0.54C0.36 0.78 0.6 0.92 0.78 0.84C0.88 0.8 0.92 0.6 0.92 0.44',
      'M0.46 0.68C0.56 0.6 0.76 0.56 0.9 0.5M0.52 0.74C0.62 0.68 0.78 0.64 0.88 0.58',
      'M0.12 0.92C0.2 0.9 0.26 0.94 0.34 0.92M0.66 0.97C0.76 0.95 0.84 0.98 0.94 0.96',
    ],
  },

  // A harp: a doubled pillar, the crown and its scroll, the sound board, and seven
  // strings that shorten toward the treble.
  harp: {
    paths: [
      'M0.17 0.9L0.17 0.6L0.22 0.3L0.32 0.14M0.23 0.9L0.23 0.62L0.28 0.32L0.36 0.18',
      'M0.32 0.14C0.36 0.1 0.38 0.1 0.4 0.1C0.48 0.06 0.56 0.1 0.6 0.15C0.7 0.2 0.76 0.24 0.8 0.3',
      'M0.46 0.08C0.5 0.02 0.58 0.05 0.54 0.1',
      'M0.8 0.3C0.9 0.4 0.9 0.54 0.85 0.6C0.8 0.74 0.76 0.84 0.7 0.9',
      'M0.26 0.9L0.84 0.4',
      'M0.3 0.2L0.3 0.866M0.38 0.12L0.38 0.797M0.46 0.1L0.46 0.729M0.54 0.1L0.54 0.66M0.62 0.17L0.62 0.591M0.7 0.23L0.7 0.523M0.78 0.28L0.78 0.454',
      'M0.14 0.92L0.74 0.92',
    ],
  },

  // A heron: S-curved neck and beak, crest, a raised wing, tail, and long legs.
  heron: {
    paths: [
      'M0.06 0.14C0.14 0.16 0.24 0.18 0.3 0.28C0.36 0.36 0.28 0.48 0.3 0.55C0.32 0.6 0.38 0.62 0.45 0.62',
      'M0.06 0.14L-0.02 0.16L0.06 0.17M0.1 0.15C0.08 0.08 0.03 0.07 0 0.09',
      'M0.3 0.55C0.38 0.72 0.7 0.7 0.84 0.46M0.84 0.46C0.9 0.5 0.94 0.54 0.96 0.56M0.84 0.46C0.9 0.46 0.96 0.5 0.98 0.58',
      'M0.45 0.62C0.5 0.46 0.55 0.36 0.56 0.34C0.62 0.28 0.7 0.24 0.76 0.24C0.8 0.3 0.82 0.4 0.84 0.46',
      'M0.56 0.4C0.64 0.34 0.7 0.32 0.78 0.34M0.52 0.5C0.62 0.42 0.72 0.4 0.8 0.42',
      'M0.45 0.66L0.48 0.78L0.44 0.95M0.48 0.78L0.6 0.95M0.44 0.95L0.36 0.97M0.6 0.95L0.68 0.97',
    ],
  },

  // A lighthouse on its rock: striped tower, gallery, lamp room, beams and waves.
  lighthouse: {
    paths: [
      'M0.35 0.95L0.4 0.66L0.42 0.42M0.65 0.95L0.6 0.66L0.58 0.42',
      'M0.37 0.8Q0.5 0.84 0.63 0.8M0.4 0.66Q0.5 0.7 0.6 0.66M0.41 0.53Q0.5 0.57 0.59 0.53',
      'M0.36 0.42L0.64 0.42L0.62 0.38L0.38 0.38Z',
      'M0.44 0.38L0.44 0.28L0.56 0.28L0.56 0.38M0.42 0.28L0.5 0.18L0.58 0.28M0.5 0.18L0.5 0.06',
      'M0.44 0.32L0.12 0.2M0.44 0.32L0.12 0.36M0.56 0.32L0.88 0.2M0.56 0.32L0.88 0.36',
      'M0.1 0.97C0.18 0.94 0.26 1 0.34 0.97M0.66 0.97C0.74 0.94 0.82 1 0.9 0.97',
    ],
  },

  // A whale: body, flukes, pectoral fin, eye, throat grooves and a spout.
  whale: {
    paths: [
      'M0.08 0.5C0.08 0.4 0.14 0.34 0.2 0.34C0.4 0.26 0.7 0.3 0.88 0.38',
      'M0.08 0.5C0.1 0.6 0.2 0.66 0.3 0.66C0.5 0.72 0.7 0.66 0.8 0.52C0.84 0.46 0.86 0.42 0.88 0.38',
      'M0.88 0.38C0.9 0.3 0.94 0.24 0.98 0.2M0.88 0.38C0.9 0.44 0.94 0.48 0.99 0.5',
      'M0.45 0.68C0.45 0.78 0.5 0.84 0.6 0.86C0.58 0.78 0.56 0.72 0.55 0.68',
      'M0.15 0.46Q0.17 0.44 0.19 0.46M0.14 0.56C0.3 0.6 0.5 0.62 0.68 0.58',
      'M0.36 0.3L0.4 0.14L0.32 0.04M0.4 0.14L0.48 0.06M0.4 0.14L0.28 0.12',
    ],
  },
};
