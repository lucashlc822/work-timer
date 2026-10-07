import { between, rngFromSeed } from '@/shared/lib';

import type { Point } from './types';

/**
 * Where things sit on screen, in pixels, as pure functions of the viewport.
 *
 * A constellation's shape lives in the unit square; a `Placement` is the
 * square box it is drawn into. Nothing here is random except through seeds,
 * so a reload puts every star back exactly where it was.
 */
export interface Placement {
  x: number;
  y: number;
  /** Side of the square box, in px. */
  size: number;
}

export const toPixels = (p: Point, box: Placement): [number, number] => [
  box.x + p[0] * box.size,
  box.y + p[1] * box.size,
];

/**
 * The constellation shown behind the timer: centred in the upper part of the
 * window, clear of the countdown below it.
 */
export const heroPlacement = (width: number, height: number): Placement => {
  const size = Math.min(width * 0.72, height * 0.32);
  return { x: (width - size) / 2, y: height * 0.1, size };
};

/**
 * The full sky: every constellation in a grid, sized as large as fits.
 *
 * Tries every column count and keeps the one with the biggest cells, so one
 * constellation fills the window and twenty still fit. No pan or zoom — see
 * the plan's known limits.
 */
export const gridPlacements = (
  count: number,
  width: number,
  height: number,
  insets: { top: number; bottom: number } = { top: height * 0.1, bottom: height * 0.14 },
): Placement[] => {
  if (count === 0) return [];
  const available = height - insets.top - insets.bottom;

  let best = { cols: 1, rows: count, cell: 0 };
  for (let cols = 1; cols <= count; cols += 1) {
    const rows = Math.ceil(count / cols);
    const cell = Math.min(width / cols, available / rows);
    if (cell > best.cell) best = { cols, rows, cell };
  }

  const { cols, rows, cell } = best;
  const left = (width - cols * cell) / 2;
  const top = insets.top + (available - rows * cell) / 2;
  // The shape takes most of the cell; the rest is breathing room and a label.
  const size = cell * 0.7;

  return Array.from({ length: count }, (_, i) => ({
    x: left + (i % cols) * cell + (cell - size) / 2,
    y: top + Math.floor(i / cols) * cell + (cell - size) * 0.35,
    size,
  }));
};

/** A wandering star's resting place: anywhere, but always the same place. */
export const wanderingPosition = (
  seed: string,
  width: number,
  height: number,
): [number, number] => {
  const rng = rngFromSeed(`wander:${seed}`);
  return [between(rng, 0.04, 0.96) * width, between(rng, 0.04, 0.96) * height];
};
