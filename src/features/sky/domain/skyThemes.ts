import { LAVENDER_400, MINT_300, NIGHT_900, ROSE_300 } from '../../../../design-tokens.mjs';

import type { StarStyle } from './starStyles';

/**
 * How each sky theme looks (M6). The shop sells these by key; this file is the
 * visual side. Keys are permanent — the equipped one is a synced setting — so a
 * theme may be retired from sale but never renamed or removed.
 *
 * A theme recolours the ambient night only: the ground behind everything, the
 * nebula clouds, and the tint of the background stars. The field's geometry
 * (where every star and cloud sits) is the same in every theme, and the earned
 * stars are drawn the same on all of them.
 *
 * `night` is the pre-M6 sky and renders exactly as it always did (golden test):
 * no ground fill, and the original cloud hues. It is also what an unknown key
 * falls back to, so a theme added by a newer app still shows something sensible
 * on an older one. The hex values live here because they are sky-only; the
 * `design-tokens.mjs` mirror is for values that also exist in `tokens.css`.
 */
export interface SkyTheme {
  /** Top and bottom of the ground gradient; `null` leaves the app's own night behind. */
  ground: readonly [top: string, bottom: string] | null;
  /** The hue of each of the four nebula clouds; `null` keeps the original lavender/rose/mint. */
  cloudHues: readonly [string, string, string, string] | null;
  /** Tints the background stars along the same cool → white → warm axis as earned stars. */
  starPalette: StarStyle['palette'] | null;
}

export const DEFAULT_SKY_THEME = 'night';

export const SKY_THEMES: Readonly<Record<string, SkyTheme>> = {
  night: { ground: null, cloudHues: null, starPalette: null },
  dusk: {
    ground: ['#190f26', '#2b1526'],
    cloudHues: [ROSE_300, '#ffcf8a', LAVENDER_400, ROSE_300],
    starPalette: { cool: '#ffe9d6', core: '#fffdf8', warm: '#ffd2a0' },
  },
  tide: {
    ground: ['#06141f', '#0b2431'],
    cloudHues: ['#8ec5ff', MINT_300, '#8ec5ff', MINT_300],
    starPalette: { cool: '#c4e4ff', core: '#ffffff', warm: '#dff6ee' },
  },
  bloom: {
    ground: ['#1a1030', '#241238'],
    cloudHues: ['#c9b8f0', ROSE_300, MINT_300, '#c9b8f0'],
    starPalette: { cool: '#e3d9ff', core: '#fffdf8', warm: '#ffe0ee' },
  },
};

/** The theme for a stored key; anything unknown, or absent, is night. */
export const skyThemeFor = (key: string | null | undefined): SkyTheme =>
  (key !== null && key !== undefined ? SKY_THEMES[key] : undefined) ??
  (SKY_THEMES[DEFAULT_SKY_THEME] as SkyTheme);

/** Every theme key this build can draw; `app/` checks the shop sells only these. */
export const SKY_THEME_KEYS: readonly string[] = Object.keys(SKY_THEMES);

/**
 * A CSS `background` for a small swatch of the theme: its ground with a few
 * clouds over it. For the shop; the real sky is drawn on a canvas.
 */
export const themeSwatchBackground = (key: string | null | undefined): string => {
  const theme = skyThemeFor(key);
  const [top, bottom] = theme.ground ?? [NIGHT_900, NIGHT_900];
  const hues = theme.cloudHues ?? [LAVENDER_400, ROSE_300, MINT_300, LAVENDER_400];
  const cloud = (hue: string, at: string): string =>
    `radial-gradient(circle at ${at}, ${hue}66 0%, ${hue}00 55%)`;
  return [
    cloud(hues[0], '25% 35%'),
    cloud(hues[1], '78% 70%'),
    cloud(hues[2], '30% 85%'),
    `linear-gradient(${top}, ${bottom})`,
  ].join(', ');
};
