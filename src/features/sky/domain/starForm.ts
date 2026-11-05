import { STAR_WHITE } from '../../../../design-tokens.mjs';

import { focusWeight, mix, type StarAppearance } from './starAppearance';
import { starStyleFor } from './starStyles';

/**
 * The shape of one star as it is drawn: a bright core, a soft corona, and thin
 * diffraction spikes — the look of a star in a telescope photograph, where the
 * eye reads "star" rather than "dot".
 *
 * A pure function of what `starAppearance` already decided (colour, size,
 * brightness, glow) plus the session's length and style, so every device draws
 * the same star. `starAppearance` itself is untouched; its golden test still
 * pins the pre-M6 look.
 *
 * What a style may change here (View sky upgrade, 2026-11-04): the glow's
 * *form* — how many spikes, at what angle, in which tint, and how the corona is
 * shaped. What it may not change is what says how long the session was: size,
 * brightness, twinkle, and **spike length** read the same in every style. That
 * widens the M6 rule ("a style recolours and scales the glow only").
 *
 * Every star of one style shares one spike orientation, as in a real image:
 * that is what makes a field of them read as a photograph and not as stickers.
 */

/** The tier's own richness: how far the corona reaches. Mirrors `TIERS[tier].style`. */
export type TierStyle = 'plain' | 'glow' | 'nebula';

export interface Spike {
  /** Radians, clockwise from pointing right (SVG's y axis points down). */
  angle: number;
  /** From the star's centre to the tip, in px. */
  length: number;
  /** Thickness at the centre, in px; it tapers to a point. */
  width: number;
  /** `#rrggbb`. */
  color: string;
  opacity: number;
}

export interface CoronaStop {
  /** 0 at the centre, 1 at the edge. */
  offset: number;
  color: string;
  opacity: number;
}

export interface StarForm {
  /** The coloured body's radius, px. */
  radius: number;
  /** The white core's radius, px. */
  coreR: number;
  corona: { rx: number; ry: number; stops: readonly CoronaStop[] };
  spikes: readonly Spike[];
  /** A faint halo ring; only some styles have one. */
  ring: { r: number; color: string; opacity: number } | null;
}

type Tint = 'self' | 'cool' | 'warm' | 'core';

interface Recipe {
  spikes: readonly { angle: number; scale: number; tint: Tint }[];
  /** Spike thickness at the centre, as a share of the star's radius. */
  width: number;
  /** Peak spike opacity before the star's own brightness. */
  opacity: number;
  /** The corona's vertical stretch; 1 is round. */
  coronaTall: number;
  /** Colour the corona from the style's palette instead of the star's own colour. */
  coronaFromPalette: boolean;
  ring: boolean;
}

const TAU = Math.PI * 2;
const at = (degrees: number) => (degrees * Math.PI) / 180;
const evenly = (count: number, offsetDeg: number, scale: number, tint: Tint) =>
  Array.from({ length: count }, (_, i) => ({
    angle: at(offsetDeg) + (TAU * i) / count,
    scale,
    tint,
  }));

/**
 * One recipe per star style key; `STAR_STYLES` and this stay in step (a test
 * checks it). An unknown key draws as classic, like everywhere else.
 */
export const STAR_FORMS: Readonly<Record<string, Recipe>> = {
  // Four even spikes: the familiar telescope cross.
  classic: {
    spikes: evenly(4, 0, 1, 'self'),
    width: 0.5,
    opacity: 0.6,
    coronaTall: 1,
    coronaFromPalette: false,
    ring: false,
  },
  // Short, soft, warm: an ember's glow more than a point of light.
  ember: {
    spikes: evenly(4, 0, 0.6, 'self'),
    width: 0.9,
    opacity: 0.42,
    coronaTall: 1,
    coronaFromPalette: false,
    ring: false,
  },
  // Two vertical streamers, cool above and warm below, in a tall corona.
  aurora: {
    spikes: [
      { angle: at(-90), scale: 1.15, tint: 'cool' },
      { angle: at(90), scale: 1.15, tint: 'warm' },
    ],
    width: 0.6,
    opacity: 0.6,
    coronaTall: 1.7,
    coronaFromPalette: true,
    ring: false,
  },
  // Six crisp, thin spikes: cut glass.
  crystal: {
    spikes: evenly(6, 30, 1, 'self'),
    width: 0.32,
    opacity: 0.78,
    coronaTall: 1,
    coronaFromPalette: false,
    ring: false,
  },
  // Four diagonal spikes, each a different colour of the palette, and a ring.
  prism: {
    spikes: [
      { angle: at(45), scale: 1, tint: 'cool' },
      { angle: at(135), scale: 1, tint: 'core' },
      { angle: at(225), scale: 1, tint: 'warm' },
      { angle: at(315), scale: 1, tint: 'core' },
    ],
    width: 0.5,
    opacity: 0.66,
    coronaTall: 1,
    coronaFromPalette: false,
    ring: true,
  },
};

const DEFAULT_RECIPE = STAR_FORMS['classic'] as Recipe;

/** How far each tier's corona reaches, in star radii (the old halo factors). */
const CORONA_REACH: Record<TierStyle, number> = { plain: 2.2, glow: 2.8, nebula: 3.3 };
/** How strong each tier's corona is at its centre. */
const CORONA_STRENGTH: Record<TierStyle, number> = { plain: 0.62, glow: 0.74, nebula: 0.8 };

/** Spike length, in star radii, from a 5-minute session up to a 3-hour one. */
const SPIKE_MIN = 1.5;
const SPIKE_RANGE = 5;

export interface FormOptions {
  /** Scales spike length; wandering stars use a smaller one. */
  spikeScale?: number;
}

/**
 * @param look the star's appearance (colour, size, brightness, glow)
 * @param focusS the session's focus time: it alone sets spike length
 * @param styleKey the stored style key; unknown or absent draws as classic
 * @param baseR the radius of a default star in this sky, in px
 * @param tier the constellation tier's richness, which sets the corona's reach
 */
export const starForm = (
  look: StarAppearance,
  focusS: number,
  styleKey: string | null | undefined,
  baseR: number,
  tier: TierStyle,
  options: FormOptions = {},
): StarForm => {
  const recipe =
    (styleKey !== null && styleKey !== undefined ? STAR_FORMS[styleKey] : undefined) ??
    DEFAULT_RECIPE;
  const palette = starStyleFor(styleKey).palette;
  const r = baseR * look.radius;
  const spikeLength =
    r * (SPIKE_MIN + SPIKE_RANGE * focusWeight(focusS)) * (options.spikeScale ?? 1);

  const tintOf = (tint: Tint): string => {
    switch (tint) {
      case 'cool':
        return palette.cool;
      case 'warm':
        return palette.warm;
      case 'core':
        return palette.core;
      default:
        // The star's own colour, lifted toward white so the spike reads as light.
        return mix(look.color, STAR_WHITE, 0.35);
    }
  };

  const reach = r * CORONA_REACH[tier] * look.glow;
  const coronaColor = recipe.coronaFromPalette ? mix(look.color, palette.cool, 0.5) : look.color;
  const strength = CORONA_STRENGTH[tier] * look.brightness * 0.5;

  return {
    radius: r,
    coreR: r * 0.45,
    corona: {
      rx: reach / Math.sqrt(recipe.coronaTall),
      ry: reach * Math.sqrt(recipe.coronaTall),
      stops: [
        { offset: 0, color: coronaColor, opacity: strength },
        { offset: 0.35, color: coronaColor, opacity: strength * 0.42 },
        { offset: 1, color: coronaColor, opacity: 0 },
      ],
    },
    spikes: recipe.spikes.map((s) => ({
      angle: s.angle,
      length: spikeLength * s.scale,
      width: Math.max(0.6, r * recipe.width),
      color: tintOf(s.tint),
      opacity: recipe.opacity * look.brightness,
    })),
    ring: recipe.ring ? { r: r * 2, color: palette.core, opacity: 0.22 * look.brightness } : null,
  };
};
