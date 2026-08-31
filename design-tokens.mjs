/**
 * Build-time palette source.
 *
 * The canonical runtime palette lives in `src/styles/tokens.css` as CSS custom
 * properties. These few values are mirrored here because two build-time
 * consumers cannot read CSS: the PWA manifest (vite.config.ts) and the
 * procedural icon generator (scripts/generate-icons.mjs).
 *
 * If you change a value here, change it in tokens.css too — there is a test
 * (src/styles/tokens.test.ts) that fails if the two drift apart.
 */

/** Deep indigo the whole app sits on. Manifest theme + background colour. */
export const NIGHT_900 = '#0b0a1a';

/** Primary pastel accent. The colour of the app icon's star. */
export const LAVENDER_300 = '#c9b8f0';

/** Warm star highlight, used for the icon's core. */
export const STAR_WARM = '#ffe9c4';
