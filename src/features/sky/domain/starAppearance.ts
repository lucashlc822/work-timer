import { between, rngFromSeed } from '@/shared/lib';

import { starStyleFor, STAR_STYLES, type StarStyle } from './starStyles';

/**
 * How one star looks, as a pure function of its session.
 *
 * Colour temperature is the single biggest realism lever — a field of stars
 * all the same white reads as programmer art — so each seed lands somewhere on
 * the cool → white → warm axis. Twinkle phase and period are per-star, because
 * synchronised pulsing looks fake instantly.
 *
 * Longer sessions make brighter, larger stars. That is how total focus time
 * shows up in the sky without becoming a second progress bar.
 *
 * A star style (M6) only recolours the temperature axis and scales the glow;
 * with the default `classic` style every field is exactly what it was before
 * styles existed, and an unknown style key draws as classic.
 */
export interface StarAppearance {
  /** `#rrggbb`. */
  color: string;
  /** In sky units, where 1 is the default star. */
  radius: number;
  /** Peak opacity, in (0, 1]. */
  brightness: number;
  /** Radians. */
  twinklePhase: number;
  twinklePeriodMs: number;
  /** Multiplier for the halo; 1 for the classic style. */
  glow: number;
}

const MIN_FOCUS_S = 5 * 60;
const MAX_FOCUS_S = 3 * 60 * 60;

const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const rgbToHex = ([r, g, b]: [number, number, number]): string =>
  `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;

const mix = (a: string, b: string, t: number): string => {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex([ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t]);
};

const CLASSIC = STAR_STYLES['classic'] as StarStyle;

/** Temperature in [0, 1]: 0 cool, 0.5 white, 1 warm, on a style's palette (classic by default). */
export const temperatureColor = (
  temperature: number,
  palette: StarStyle['palette'] = CLASSIC.palette,
): string =>
  temperature < 0.5
    ? mix(palette.cool, palette.core, temperature * 2)
    : mix(palette.core, palette.warm, (temperature - 0.5) * 2);

/** 0 for a 5-minute session, 1 for three hours, on a square-root curve. */
export const focusWeight = (focusS: number): number => {
  const clamped = Math.min(MAX_FOCUS_S, Math.max(MIN_FOCUS_S, focusS));
  return Math.sqrt((clamped - MIN_FOCUS_S) / (MAX_FOCUS_S - MIN_FOCUS_S));
};

export const starAppearance = (
  seed: string,
  focusS: number,
  styleKey?: string | null,
): StarAppearance => {
  const rng = rngFromSeed(`star:${seed}`);
  const weight = focusWeight(focusS);
  const style = starStyleFor(styleKey);

  return {
    color: temperatureColor(rng(), style.palette),
    radius: (0.75 + weight * 0.75) * between(rng, 0.9, 1.1),
    brightness: 0.7 + weight * 0.3,
    twinklePhase: between(rng, 0, Math.PI * 2),
    twinklePeriodMs: between(rng, 2800, 5200),
    glow: style.glow,
  };
};
