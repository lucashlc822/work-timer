import { describe, expect, it } from 'vitest';

import {
  clampDailyGoal,
  CONSTELLATION_BONUS,
  sessionEarning,
  streakBonus,
  streakMilestones,
} from './economy';

describe('streakBonus', () => {
  it('pays at 3, 7, 14 and 30 days, and nothing in between', () => {
    expect([1, 2, 3, 4, 7, 10, 14, 29, 30].map(streakBonus)).toEqual([
      0, 0, 30, 0, 70, 0, 150, 0, 300,
    ]);
  });

  it('pays 300 again every 30 days after the first month', () => {
    expect([31, 59, 60, 61, 90, 120].map(streakBonus)).toEqual([0, 0, 300, 0, 300, 300]);
  });

  it('lists the milestones a run has reached', () => {
    expect(streakMilestones(2)).toEqual([]);
    expect(streakMilestones(7)).toEqual([3, 7]);
    expect(streakMilestones(61)).toEqual([3, 7, 14, 30, 60]);
  });
});

describe('constellation bonuses and the goal setting', () => {
  it('pays more for harder tiers', () => {
    expect(CONSTELLATION_BONUS).toEqual({ easy: 25, medium: 75, hard: 200 });
  });

  it('keeps the goal inside what the server accepts', () => {
    expect([0, 4, 5, 62.4, 1440, 5000].map(clampDailyGoal)).toEqual([5, 5, 5, 62, 1440, 1440]);
  });
});

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
