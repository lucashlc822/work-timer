import { describe, expect, it } from 'vitest';

import { ringFraction } from './ring';

describe('ringFraction', () => {
  it('is the share of the goal done', () => {
    expect(ringFraction(30, 60)).toBe(0.5);
    expect(ringFraction(0, 60)).toBe(0);
  });
  it('never passes a full ring, or goes below none', () => {
    expect(ringFraction(90, 60)).toBe(1);
    expect(ringFraction(-5, 60)).toBe(0);
  });
  it('treats a zero goal as complete', () => {
    expect(ringFraction(0, 0)).toBe(1);
  });
});
