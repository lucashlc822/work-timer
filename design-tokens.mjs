/**
 * Build-time palette source.
 *
 * The canonical runtime palette lives in `src/styles/tokens.css` as CSS custom
 * properties. These few values are mirrored here because three consumers
 * cannot read CSS: the PWA manifest (vite.config.ts), the procedural icon
 * generator (scripts/generate-icons.mjs), and the sky renderer
 * (src/features/sky), whose canvas and pure domain functions need concrete
 * colours rather than custom properties.
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

/*
 * The sky renderer's palette. Canvas and generated SVG need concrete colour
 * values: a CSS custom property that fails to resolve renders black silently,
 * and the sky's domain functions must stay pure and testable without a DOM.
 */

/** Star colour temperature: cool end, neutral core, warm end. */
export const STAR_COOL = '#d6e8ff';
export const STAR_CORE = '#fffdf8';
export const STAR_WHITE = '#ffffff';

/** Nebula hues, blended additively over the night ground. */
export const LAVENDER_400 = '#ab93e6';
export const ROSE_300 = '#f3b8d4';
export const MINT_300 = '#a8e6d0';
