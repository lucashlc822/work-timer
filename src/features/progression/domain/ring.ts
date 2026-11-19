/**
 * The goal ring's arc, as a fraction of a full turn: today's focus over the
 * goal, never past a full ring and never negative. A goal of zero reads as
 * complete rather than dividing by it.
 */
export const ringFraction = (focusMin: number, goalMin: number): number =>
  goalMin <= 0 ? 1 : Math.min(1, Math.max(0, focusMin / goalMin));
