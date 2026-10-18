import { STAR_COOL, STAR_CORE, STAR_WARM } from '../../../../design-tokens.mjs';

/**
 * How each star style looks (M6). The shop in `features/progression` sells
 * these by key; this file is the visual side, keyed by the same strings. The
 * keys are permanent — they are stored on every session, and in ledger refs —
 * so a style may be retired from sale but never renamed or removed.
 *
 * A style recolours the cool → white → warm axis a seed is placed on, and
 * scales the glow. It never changes a star's size, brightness or twinkle:
 * those say how long the session was, and must read the same in any style.
 *
 * `classic` reproduces the pre-M6 look exactly (golden test), and is what an
 * unknown key falls back to — so a style added by a newer app still renders as
 * something sensible on an older one.
 *
 * The hex values live here rather than in `design-tokens.mjs`: that file only
 * mirrors values that also exist in `tokens.css`, and these are sky-only.
 */
export interface StarStyle {
  /** Colour at temperature 0, 0.5 and 1. */
  palette: { cool: string; core: string; warm: string };
  /** Multiplies the halo around a star; 1 is the classic glow. */
  glow: number;
}

export const DEFAULT_STAR_STYLE = 'classic';

export const STAR_STYLES: Readonly<Record<string, StarStyle>> = {
  classic: { palette: { cool: STAR_COOL, core: STAR_CORE, warm: STAR_WARM }, glow: 1 },
  ember: { palette: { cool: '#ffd9a8', core: '#ffb877', warm: '#ff8a5c' }, glow: 1.25 },
  aurora: { palette: { cool: '#a8e6d0', core: '#d9fff0', warm: '#f3b8d4' }, glow: 1.2 },
  crystal: { palette: { cool: '#bfe3ff', core: '#ffffff', warm: '#d9ccff' }, glow: 1.5 },
  prism: { palette: { cool: '#ab93e6', core: '#fffdf8', warm: '#ffcf8a' }, glow: 1.35 },
};

/** The style for a stored key; anything unknown, or absent, is classic. */
export const starStyleFor = (key: string | null | undefined): StarStyle =>
  (key !== null && key !== undefined ? STAR_STYLES[key] : undefined) ??
  (STAR_STYLES[DEFAULT_STAR_STYLE] as StarStyle);

/** Every style key this build can draw; `app/` checks the shop sells only these. */
export const STAR_STYLE_KEYS: readonly string[] = Object.keys(STAR_STYLES);
