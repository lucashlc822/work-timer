import { describe, expect, it } from 'vitest';

import type { FriendSession, FriendSky } from '@/features/friends';
import { streakAt } from '@/features/progression';
import { formatFocus, periodContaining, totals } from '@/features/stats';

import { summarizeFriend } from './friendSlots';

const now = new Date(2026, 9, 22, 18, 0).getTime(); // a Thursday
const at = (day: number, hour: number) => new Date(2026, 9, day, hour, 0).getTime();

const sessions: FriendSession[] = [
  // Last week (Monday 19th starts this week): focus not counted this week.
  {
    id: 'a',
    seed: 'a',
    startedAt: at(17, 9),
    endedAt: at(17, 9) + 1_500_000,
    actualFocusS: 1500,
    outcome: 'completed',
  },
  // This week: two completed days in a row, ending today, and one ended early.
  {
    id: 'b',
    seed: 'b',
    startedAt: at(21, 9),
    endedAt: at(21, 9) + 1_500_000,
    actualFocusS: 1500,
    outcome: 'completed',
  },
  {
    id: 'c',
    seed: 'c',
    startedAt: at(22, 9),
    endedAt: at(22, 9) + 3_000_000,
    actualFocusS: 3000,
    outcome: 'completed',
  },
  {
    id: 'd',
    seed: 'd',
    startedAt: at(22, 11),
    endedAt: at(22, 11) + 600_000,
    actualFocusS: 600,
    outcome: 'cancelled',
  },
];

const sky: FriendSky = { displayName: 'Ada', themeKey: null, sessions, choices: [] };

describe('summarizeFriend', () => {
  it('gives the same numbers the friend sees in their own Stats and streak', () => {
    // Their own rows carry away time; it doesn't change any of these numbers.
    const own = sessions.map((s) => ({ ...s, awayMs: 0 }));
    const week = totals(own, periodContaining('week', now));

    const summary = summarizeFriend(sky, now);
    expect(summary.focusThisWeek).toBe(formatFocus(week.focusS));
    expect(summary.starsThisWeek).toBe(week.stars);
    expect(summary.streakDays).toBe(streakAt(own, now));
  });

  it('counts an ended-early session’s focus but gives it no star', () => {
    const summary = summarizeFriend(sky, now);
    expect(summary.focusThisWeek).toBe(formatFocus(1500 + 3000 + 600));
    expect(summary.starsThisWeek).toBe(2);
    expect(summary.streakDays).toBe(2);
    expect(summary.constellations).toBe(0);
  });
});
