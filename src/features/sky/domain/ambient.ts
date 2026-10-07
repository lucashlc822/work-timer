import { LAVENDER_400, MINT_300, ROSE_300 } from '../../../../design-tokens.mjs';
import { between, intBetween, pick, rngFromSeed } from '@/shared/lib';

import { temperatureColor } from './starAppearance';

/**
 * The ambient night: background stars in three parallax layers, plus pastel
 * nebula clouds. Decoration only — none of it is earned — so it comes from one
 * fixed seed and is the same sky for everyone.
 *
 * Coordinates are in the unit square and scaled to the viewport by the
 * renderer, so a resize re-lays the same field rather than re-rolling it.
 */

export interface AmbientStar {
  x: number;
  y: number;
  /** 0 = far, 2 = near. Nearer layers are larger, brighter, and drift faster. */
  layer: 0 | 1 | 2;
  radius: number;
  alpha: number;
  color: string;
  twinklePhase: number;
  twinklePeriodMs: number;
}

export interface NebulaPuff {
  x: number;
  y: number;
  /** Fraction of the viewport's larger side. */
  radius: number;
  color: string;
  alpha: number;
}

export interface AmbientField {
  stars: AmbientStar[];
  nebula: NebulaPuff[];
}

const AMBIENT_SEED = 'starkeep-ambient-v1';
const STARS_PER_LAYER = [140, 60, 22] as const;

/** Drift speed per layer, in viewport widths per minute. */
export const LAYER_DRIFT = [0.004, 0.008, 0.014] as const;

export const ambientField = (): AmbientField => {
  const rng = rngFromSeed(AMBIENT_SEED);

  const stars: AmbientStar[] = [];
  STARS_PER_LAYER.forEach((count, layer) => {
    for (let i = 0; i < count; i += 1) {
      stars.push({
        x: rng(),
        y: rng(),
        layer: layer as AmbientStar['layer'],
        radius: between(rng, 0.35, 0.7) * (1 + layer * 0.6),
        alpha: between(rng, 0.25, 0.55) + layer * 0.15,
        color: temperatureColor(rng()),
        twinklePhase: between(rng, 0, Math.PI * 2),
        twinklePeriodMs: between(rng, 2500, 6000),
      });
    }
  });

  // Each cloud is a cluster of soft puffs around a centre: layered, offset
  // gradients read as structure, where one big gradient reads as a smudge.
  //
  // One hue per cloud: additively mixing lavender, rose and mint in the same
  // place averages them towards grey, which is exactly the muddy look to avoid.
  const clouds = [
    { hue: LAVENDER_400, x: between(rng, 0.15, 0.45), y: between(rng, 0.15, 0.4) },
    { hue: ROSE_300, x: between(rng, 0.55, 0.85), y: between(rng, 0.55, 0.8) },
    { hue: MINT_300, x: between(rng, 0.1, 0.4), y: between(rng, 0.7, 0.9) },
    {
      hue: pick(rng, [LAVENDER_400, ROSE_300]),
      x: between(rng, 0.6, 0.9),
      y: between(rng, 0.1, 0.35),
    },
  ];
  const nebula: NebulaPuff[] = [];
  for (const cloud of clouds) {
    const puffs = intBetween(rng, 5, 8);
    for (let p = 0; p < puffs; p += 1) {
      nebula.push({
        x: cloud.x + between(rng, -0.16, 0.16),
        y: cloud.y + between(rng, -0.12, 0.12),
        radius: between(rng, 0.1, 0.26),
        color: cloud.hue,
        alpha: between(rng, 0.04, 0.08),
      });
    }
  }

  return { stars, nebula };
};
