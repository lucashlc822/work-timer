/**
 * Platform capability detection.
 *
 * Used to pick *defaults*, never to gate behaviour outright. The abandonment
 * policy in particular is one code path with a per-platform default that the
 * user can override — a phone enforces the focus contract, a desktop records
 * it on the honour system, and either can be switched.
 */

const matches = (query: string): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(query).matches
    : false;

/** True when launched from the home screen / installed, rather than in a browser tab. */
export const isStandalone = (): boolean =>
  matches('(display-mode: standalone)') ||
  matches('(display-mode: window-controls-overlay)') ||
  // iOS Safari predates the display-mode media query for home-screen launches.
  (typeof navigator !== 'undefined' &&
    (navigator as Navigator & { standalone?: boolean }).standalone === true);

/** True on touch-primary devices. The proxy for "this is a phone or tablet". */
export const isTouchPrimary = (): boolean => matches('(pointer: coarse)');

export const prefersReducedMotion = (): boolean => matches('(prefers-reduced-motion: reduce)');

/**
 * How leaving the app during a session is treated.
 *
 * - `strict`   — exceeding the grace period forfeits the session.
 * - `lenient`  — time away is recorded on the session but does not forfeit it.
 */
export type AbandonmentPolicy = 'strict' | 'lenient';

/**
 * Strict on mobile, lenient on desktop.
 *
 * Not a technical limitation — the Page Visibility API reports tab switches on
 * desktop perfectly well. It is a product judgement: desktop work legitimately
 * spans windows (docs, references, a terminal), so enforcing there would
 * produce constant false forfeits. On a phone, leaving the app really is the
 * distraction the timer exists to prevent.
 */
export const defaultAbandonmentPolicy = (): AbandonmentPolicy =>
  isTouchPrimary() ? 'strict' : 'lenient';

/** Coarse device label, stored on sessions to make cross-device history legible. */
export const describeDevice = (): string => {
  const surface = isStandalone() ? 'installed' : 'browser';
  const form = isTouchPrimary() ? 'mobile' : 'desktop';
  return `${form}/${surface}`;
};
