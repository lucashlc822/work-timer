import { describe, expect, it } from 'vitest';

import { formatAway, formatFocus, percentOf } from './format';

describe('formatFocus', () => {
  it.each([
    [0, '0 min'],
    [29, '0 min'],
    [30, '1 min'],
    [45 * 60, '45 min'],
    [2 * 3600, '2 h'],
    [2 * 3600 + 5 * 60, '2 h 05 min'],
    [-10, '0 min'],
  ])('%i s -> %s', (seconds, expected) => {
    expect(formatFocus(seconds)).toBe(expected);
  });
});

describe('formatAway', () => {
  it('shows a glimpse as <1 min and zero as 0 min', () => {
    expect(formatAway(20_000)).toBe('<1 min');
    expect(formatAway(0)).toBe('0 min');
    expect(formatAway(5 * 60_000)).toBe('5 min');
  });
});

describe('percentOf', () => {
  it('never divides by zero', () => {
    expect(percentOf(5, 0)).toBe(0);
    expect(percentOf(1, 3)).toBe(33);
  });
});
