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

/*
 * Motion. The CSS custom properties in tokens.css are the source; Motion
 * (the JS animation library) can't read them, so the same numbers live here.
 * tokens.test.ts fails if the two drift. Durations are milliseconds, easings
 * are cubic-bezier control points.
 */
export const MOTION = {
  duration: {
    press: 100,
    quick: 150,
    enter: 240,
    exit: 160,
    panelIn: 300,
    panelOut: 200,
    pageIn: 450,
    pageOut: 300,
    stagger: 30,
  },
  ease: {
    standard: [0.2, 0, 0, 1],
    enter: [0.05, 0.7, 0.1, 1],
    exit: [0.3, 0, 0.8, 0.15],
  },
};

/** Longest total a staggered group may take, however many items it has. */
export const STAGGER_CAP_MS = 240;
