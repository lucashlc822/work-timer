/**
 * Session lengths.
 *
 * Presets cover the common case in one click; the custom range stops the app
 * feeling rigid. Everything is in whole minutes at the UI boundary and
 * converted to seconds only when a draft is built.
 */

export const PRESET_MINUTES = [25, 50, 90] as const;

export const CUSTOM_MIN_MINUTES = 5;
export const CUSTOM_MAX_MINUTES = 180;
export const CUSTOM_STEP_MINUTES = 5;

export const DEFAULT_MINUTES = 25;

/**
 * A 1-minute preset so acceptance tests finish in minutes rather than half an
 * hour. The UI only offers it when `import.meta.env.DEV` is true, so it never
 * ships — kept here as data so the domain stays free of build-time globals.
 */
export const DEV_PRESET_MINUTES = 1;

/**
 * Snap an arbitrary custom value onto the allowed grid: rounded to the nearest
 * step, then clamped into range. Anything non-finite falls back to the default
 * rather than producing a NaN-length session.
 */
export const clampCustomMinutes = (minutes: number): number => {
  if (!Number.isFinite(minutes)) return DEFAULT_MINUTES;
  const stepped = Math.round(minutes / CUSTOM_STEP_MINUTES) * CUSTOM_STEP_MINUTES;
  return Math.min(CUSTOM_MAX_MINUTES, Math.max(CUSTOM_MIN_MINUTES, stepped));
};

export const minutesToSeconds = (minutes: number): number => Math.round(minutes * 60);
