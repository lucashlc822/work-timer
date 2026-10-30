import { describe, expect, it } from 'vitest';

import { radioKeyTarget } from './radioKeys';

describe('radioKeyTarget', () => {
  it('moves forward with Right and Down, and back with Left and Up', () => {
    expect(radioKeyTarget('ArrowRight', 1, 4)).toBe(2);
    expect(radioKeyTarget('ArrowDown', 1, 4)).toBe(2);
    expect(radioKeyTarget('ArrowLeft', 2, 4)).toBe(1);
    expect(radioKeyTarget('ArrowUp', 2, 4)).toBe(1);
  });

  it('wraps at both ends', () => {
    expect(radioKeyTarget('ArrowRight', 3, 4)).toBe(0);
    expect(radioKeyTarget('ArrowDown', 3, 4)).toBe(0);
    expect(radioKeyTarget('ArrowLeft', 0, 4)).toBe(3);
    expect(radioKeyTarget('ArrowUp', 0, 4)).toBe(3);
  });

  it('stays put in a group of one', () => {
    expect(radioKeyTarget('ArrowRight', 0, 1)).toBe(0);
    expect(radioKeyTarget('ArrowLeft', 0, 1)).toBe(0);
  });

  it('leaves every other key alone, Home and End included', () => {
    for (const key of ['Home', 'End', 'Enter', ' ', 'Tab', 'a', 'Escape']) {
      expect(radioKeyTarget(key, 1, 4)).toBeNull();
    }
  });

  it('has nowhere to go in an empty group', () => {
    expect(radioKeyTarget('ArrowRight', 0, 0)).toBeNull();
  });
});
