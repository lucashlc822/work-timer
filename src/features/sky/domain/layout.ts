import { between, rngFromSeed } from '@/shared/lib';

import {
  CAPTION_LINE_HEIGHT,
  MAX_CAPTION_LINES,
  captionFontSize,
  captionTop,
} from './captionLayout';
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

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A wandering star's 24 px hit circle reaches this far from its centre. */
export const WANDER_CLEARANCE = 12;

/** How many places a wandering star tries before giving up and staying where it first fell. */
export const WANDER_ATTEMPTS = 32;

/**
 * What a figure covers in the full sky, where a wandering star would be hard to
 * reach: its box (the transparent hit rect over it), and the caption below,
 * as tall as three lines and as wide as its grid cell. Both are grown by a
 * star's hit radius so the star's own target stays clear too.
 */
export const figureFootprint = (box: Placement): Rect[] => {
  const cell = box.size / 0.7;
  const cx = box.x + box.size / 2;
  const captionBottom =
    captionTop(box) + MAX_CAPTION_LINES * CAPTION_LINE_HEIGHT * captionFontSize(box);
  const c = WANDER_CLEARANCE;
  return [
    { x: box.x - c, y: box.y - c, w: box.size + 2 * c, h: box.size + 2 * c },
    {
      x: cx - cell / 2 - c,
      y: box.y + box.size,
      w: cell + 2 * c,
      h: captionBottom + c - (box.y + box.size),
    },
  ];
};

const inside = (x: number, y: number, r: Rect): boolean =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/**
 * A wandering star's resting place: anywhere, but always the same place.
 *
 * With `area`, it stays in the band between `top` px from the top and `bottom`
 * px from the bottom (for a sky with something laid over its top). With
 * `avoid`, a place that falls inside one of those rects is passed over for the
 * next one the same seed draws, up to `WANDER_ATTEMPTS`; if none is clear it
 * stays where it first fell. The first draw is the same two numbers whatever
 * is avoided, so a star that was already clear never moves.
 */
export const wanderingPosition = (
  seed: string,
  width: number,
  height: number,
  area?: { top: number; bottom: number },
  avoid?: readonly Rect[],
): [number, number] => {
  const rng = rngFromSeed(`wander:${seed}`);
  const draw = (): [number, number] => {
    const x = between(rng, 0.04, 0.96) * width;
    const y = between(rng, 0.04, 0.96);
    if (area === undefined) return [x, y * height];
    return [x, area.top + y * Math.max(0, height - area.top - area.bottom)];
  };
  const first = draw();
  if (avoid === undefined || avoid.length === 0) return first;
  let [x, y] = first;
  for (let attempt = 0; attempt < WANDER_ATTEMPTS; attempt += 1) {
    if (!avoid.some((r) => inside(x, y, r))) return [x, y];
    [x, y] = draw();
  }
  return first;
};
