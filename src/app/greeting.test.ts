import { describe, expect, it } from 'vitest';

import { greeting, greetingFor } from './greeting';

describe('greetingFor', () => {
  it.each([
    [0, 'Good evening'],
    [4, 'Good evening'],
    [5, 'Good morning'],
    [11, 'Good morning'],
    [12, 'Good afternoon'],
    [17, 'Good afternoon'],
    [18, 'Good evening'],
    [23, 'Good evening'],
  ])('hour %i is %s', (hour, expected) => {
    expect(greetingFor(hour)).toBe(expected);
  });
});

describe('greeting', () => {
  it('adds the name when there is one', () => {
    expect(greeting(9, 'Lucas')).toBe('Good morning, Lucas');
  });
  it('is just the greeting with no name, a blank one, or none yet', () => {
    expect(greeting(9, null)).toBe('Good morning');
    expect(greeting(9, undefined)).toBe('Good morning');
    expect(greeting(9, '  ')).toBe('Good morning');
  });
});
