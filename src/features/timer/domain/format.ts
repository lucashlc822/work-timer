/**
 * Display formatting. Pure, so the countdown's rounding rules are testable.
 */

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * `mm:ss`, or `h:mm:ss` from an hour up.
 *
 * Rounds *up* to the whole second, the countdown convention: a fresh 25-minute
 * session reads 25:00 rather than 24:59, and the display only reaches 00:00 at
 * the moment the session actually completes.
 */
export const formatRemaining = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
};

/** "25 minutes", "1 minute", "1 h 30 min" — for result and notification text. */
export const formatDuration = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return seconds === 1 ? '1 second' : `${seconds} seconds`;
  if (minutes < 60) return minutes === 1 ? '1 minute' : `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
};

/** Local time of day, e.g. "3:40 pm". Locale-dependent by design. */
export const formatTimeOfDay = (epochMs: number, locale?: string): string =>
  new Date(epochMs).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
