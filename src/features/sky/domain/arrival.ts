/**
 * A finished session's star arriving in the sky behind the timer
 * (session-complete redesign, PR 5).
 *
 * The result's star (`ResultStar`, in the timer's result) and the hero sky
 * (`SkyBackdrop`) are both the sky's, so they meet through this small store
 * rather than through the app: when the result's moment reaches `arrive`, the
 * result star says which session arrived, from where on screen, and whether
 * to animate; the hero picks it up and lights that star in its place.
 *
 * Module-level, like the page: one result at a time, and it clears itself when
 * the result goes.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Arrival {
  sessionId: string;
  /** Where the result's star is on screen (client px), if it could be measured. */
  from: Rect | null;
  /** Skipped or reduced motion: show the end state, no flight, no ignite. */
  instant: boolean;
}

let current: Arrival | null = null;
const listeners = new Set<() => void>();

export const announceArrival = (next: Arrival | null): void => {
  if (current === next) return;
  current = next;
  for (const listener of listeners) listener();
};

export const subscribeArrival = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const currentArrival = (): Arrival | null => current;

/** How far outside the result star's box the target must be for a flight to be worth seeing. */
export const FLIGHT_CLEARANCE = 16;

/**
 * Whether light flies from the result's star to its place in the sky, or the
 * star simply lights up where it is. The result sits over the hero figure, so
 * the target is often right behind the result's star: a flight there would be
 * hidden, and a few pixels long. It flies only from a measured star to a place
 * clearly outside it.
 */
export const arrivalPath = (
  from: Rect | null,
  to: readonly [number, number],
): 'fly' | 'in-place' => {
  if (from === null) return 'in-place';
  const [x, y] = to;
  const inside =
    x >= from.x - FLIGHT_CLEARANCE &&
    x <= from.x + from.width + FLIGHT_CLEARANCE &&
    y >= from.y - FLIGHT_CLEARANCE &&
    y <= from.y + from.height + FLIGHT_CLEARANCE;
  return inside ? 'in-place' : 'fly';
};

/** How long the light takes to travel to its place. */
export const FLIGHT_MS = 700;
