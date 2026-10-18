import { describe, expect, it } from 'vitest';

import type { SessionRow } from '@/shared/db';

import { bonusDays, focusOnDay, goalProgress, goalReachedAt } from './goal';

const at = (y: number, m: number, d: number, h = 9, min = 0): number =>
  new Date(y, m - 1, d, h, min).getTime();
const midnight = (d: number): Date => new Date(2026, 9, d);

const session = (startedAt: number, focusMin: number, o: Partial<SessionRow> = {}): SessionRow => ({
  id: crypto.randomUUID(),
  mode: 'countdown',
  plannedDurationS: focusMin * 60,
  actualFocusS: focusMin * 60,
  startedAt,
  endedAt: startedAt + focusMin * 60_000,
  outcome: 'completed',
  awayMs: 0,
  tagId: null,
  seed: 'seed',
  device: 'desktop/app',
  clientCreatedAt: startedAt,
  syncedAt: null,
  ...o,
});

// Case 5 — goal progress splits a session across midnight.
describe('focusOnDay', () => {
  it('splits a session over midnight between the two days', () => {
    const rows = [session(at(2026, 10, 6, 23, 30), 50)];
    expect(focusOnDay(rows, midnight(6))).toBe(30 * 60);
    expect(focusOnDay(rows, midnight(7))).toBe(20 * 60);
  });

  it('includes focus from a session ended early, like the stats do', () => {
    const rows = [session(at(2026, 10, 6, 9), 20, { outcome: 'cancelled' })];
    expect(focusOnDay(rows, midnight(6))).toBe(20 * 60);
  });
});

describe('goalProgress', () => {
  it('reports whole minutes and whether the goal is met', () => {
    const rows = [session(at(2026, 10, 8, 9), 35)];
    expect(goalProgress(rows, 60, at(2026, 10, 8, 12))).toEqual({
      focusMin: 35,
      goalMin: 60,
      reached: false,
    });
    expect(goalProgress(rows, 30, at(2026, 10, 8, 12)).reached).toBe(true);
  });
});

describe('goalReachedAt', () => {
  it('is the end of the session that tipped the day over the goal', () => {
    const first = session(at(2026, 10, 8, 9), 25);
    const second = session(at(2026, 10, 8, 10), 25);
    const third = session(at(2026, 10, 8, 11), 25);
    expect(goalReachedAt([third, first, second], midnight(8), 40)).toBe(second.endedAt);
  });

  it('is null when the day falls short', () => {
    expect(goalReachedAt([session(at(2026, 10, 8, 9), 25)], midnight(8), 60)).toBeNull();
  });

  it('never lands after the day ends', () => {
    const late = session(at(2026, 10, 8, 23, 50), 60);
    expect(goalReachedAt([late], midnight(8), 10)).toBe(midnight(9).getTime() - 1);
  });
});

describe('bonusDays', () => {
  it('is yesterday and today, as local midnights', () => {
    expect(bonusDays(at(2026, 10, 8, 15)).map((d) => d.getTime())).toEqual([
      at(2026, 10, 7, 0),
      at(2026, 10, 8, 0),
    ]);
  });
});
