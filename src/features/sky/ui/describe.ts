import type { ConstellationState } from '../domain/types';

/**
 * Words for screen readers and tooltips. Kept inside the sky feature rather
 * than borrowed from the timer's formatters, because features stay opaque to
 * each other.
 */

export const focusLabel = (seconds: number): string => {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return minutes === 1 ? '1 minute' : `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
};

export const minimumLabel = (minSessionS: number): string =>
  minSessionS === 0 ? 'any length' : `${Math.round(minSessionS / 60)}+ min sessions`;

export const starLabel = (endedAt: number, focusS: number): string =>
  `Star from ${new Date(endedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${focusLabel(focusS)}`;

export const progressLabel = (c: ConstellationState): string => {
  const total = c.def.shape.points.length;
  if (c.complete) return `${c.def.name}, complete`;
  const state = c.abandoned ? ', unfinished' : '';
  return `${c.def.name}, ${c.stars.length} of ${total} stars${state}`;
};
