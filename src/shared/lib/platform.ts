/**
 * Browser feature detection.
 *
 * Answers "what does this *browser* support", which is a different question
 * from "which host am I running in" — that one belongs to `shared/runtime`.
 * Keeping them apart stops the desktop/web split from leaking into styling
 * and accessibility concerns that are the same either way.
 */

const matches = (query: string): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(query).matches
    : false;

/**
 * True when the web build is running as an installed PWA rather than a tab.
 *
 * Still meaningful after the desktop pivot: the browser build remains
 * installable on Windows and macOS via Chrome/Edge, which is a distinct
 * surface from both a normal tab and the Tauri app.
 */
export const isStandalone = (): boolean =>
  matches('(display-mode: standalone)') || matches('(display-mode: window-controls-overlay)');

/**
 * Honoured wherever the app animates. The sky drifts and twinkles continuously
 * during a session, which is exactly the kind of persistent background motion
 * that triggers vestibular symptoms.
 */
export const prefersReducedMotion = (): boolean => matches('(prefers-reduced-motion: reduce)');

/**
 * Calls `callback` whenever the reduced-motion setting flips while the app is
 * open. Returns an unsubscribe. A silent no-op where `matchMedia` is missing.
 */
export const onReducedMotionChange = (callback: () => void): (() => void) => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
};
