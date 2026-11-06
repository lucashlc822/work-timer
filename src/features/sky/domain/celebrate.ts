/**
 * Which finished constellations get their completion moment (View sky upgrade
 * PR 6): the lines drawing themselves in, the figure tracing itself, a soft
 * bloom. It plays once per device, for a constellation this device has not yet
 * shown as finished, and never again.
 *
 * - **First run** (nothing recorded yet, `seen` undefined): nothing plays and
 *   every constellation already finished is recorded as seen. Otherwise the
 *   first visit after an update would replay a person's whole history.
 * - **Later:** each finished constellation not yet seen is recorded; the newest
 *   `max` of them play, newest first, and the rest are recorded silently.
 *
 * Recording happens when playback *starts*, so closing the sky part-way never
 * brings an animation back. Pure: the caller reads and writes the record.
 */

export interface FinishedConstellation {
  id: string;
  completedAt: number;
}

export interface Celebrations {
  /** To play now, newest first; at most `max`. */
  play: string[];
  /** To record as seen: everything decided, played or not. */
  markSeen: string[];
}

/** At most this many play together; any beyond are recorded without a show. */
export const MAX_CELEBRATIONS = 3;

export const pendingCelebrations = (
  finished: readonly FinishedConstellation[],
  seen: readonly string[] | undefined,
  max = MAX_CELEBRATIONS,
): Celebrations => {
  if (seen === undefined) return { play: [], markSeen: finished.map((c) => c.id) };
  const known = new Set(seen);
  const unseen = finished
    .filter((c) => !known.has(c.id))
    .sort((a, b) => b.completedAt - a.completedAt || (a.id < b.id ? -1 : 1));
  return { play: unseen.slice(0, max).map((c) => c.id), markSeen: unseen.map((c) => c.id) };
};
