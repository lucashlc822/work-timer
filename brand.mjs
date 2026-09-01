/**
 * Product identity — the single source of truth for what the app is called.
 *
 * The name is deliberately centralised here because it is not settled. It
 * reaches four otherwise-unrelated places (the PWA manifest, the HTML title
 * and iOS home-screen label, the in-app heading, and the page description),
 * and hunting those down individually is exactly how a half-renamed app ends
 * up shipping. Renaming should be an edit to this file and nothing else.
 *
 * Plain `.mjs` with a sibling `.d.mts`, matching `design-tokens.mjs`, so both
 * the Vite config and the React app can read it without a build step.
 *
 * Note this is the *product* name. The repository, the npm package name, and
 * the eventual deploy URL are separate things and are not derived from it.
 */

export const APP_NAME = 'Starkeep';

/**
 * Shown under the icon on a home screen, where roughly 12 characters survive
 * before the launcher truncates. Keep it short even when APP_NAME grows.
 */
export const APP_SHORT_NAME = 'Starkeep';

export const APP_DESCRIPTION = 'A focus timer where every session you finish becomes a star.';

/** One line of in-app copy, shown beneath the title on the home screen. */
export const APP_TAGLINE = 'Every session you finish becomes a star.';
