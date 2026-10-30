/**
 * Where an arrow key goes in a radio group of `count` items, wrapping at the
 * ends; null for any other key, so the caller leaves it alone.
 *
 * Down and Up count as well as Right and Left: a group that wraps onto several
 * rows reads in both directions. Home and End are left out on purpose, as the
 * ARIA radio pattern doesn't define them.
 */
export const radioKeyTarget = (key: string, index: number, count: number): number | null => {
  if (count < 1) return null;
  if (key === 'ArrowRight' || key === 'ArrowDown') return (index + 1) % count;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (index - 1 + count) % count;
  return null;
};
