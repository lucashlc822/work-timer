import { describe, expect, it } from 'vitest';

import { sessionEarning } from './economy';

describe('sessionEarning', () => {
  it('pays 1 Stardust per whole focused minute of a completed session', () => {
    expect(sessionEarning({ outcome: 'completed', actualFocusS: 25 * 60 })).toBe(25);
    expect(sessionEarning({ outcome: 'completed', actualFocusS: 25 * 60 + 59 })).toBe(25);
  });

  it('pays nothing for a session ended early, however long it ran', () => {
    expect(sessionEarning({ outcome: 'cancelled', actualFocusS: 40 * 60 })).toBe(0);
  });

  it('pays nothing for less than a minute, or for nonsense', () => {
    expect(sessionEarning({ outcome: 'completed', actualFocusS: 59 })).toBe(0);
    expect(sessionEarning({ outcome: 'completed', actualFocusS: -600 })).toBe(0);
    expect(sessionEarning({ outcome: null, actualFocusS: 600 })).toBe(0);
  });
});
