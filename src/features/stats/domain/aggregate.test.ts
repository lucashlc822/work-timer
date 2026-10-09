import { describe, expect, it } from 'vitest';

import type { SessionRow } from '@/shared/db';

import { focusBuckets, focusByTag, historyFor, totals } from './aggregate';
import { periodContaining } from './period';

const at = (y: number, m: number, d: number, h = 0, min = 0): number =>
  new Date(y, m - 1, d, h, min).getTime();

let n = 0;
const session = (startedAt: number, focusMin: number, o: Partial<SessionRow> = {}): SessionRow => ({
  id: `s${++n}`,
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

// Mon 5 Oct 2026 – Mon 12 Oct 2026
const WEEK = periodContaining('week', at(2026, 10, 7));
const focusOf = (rows: readonly SessionRow[], dayIndex: number): number =>
  focusBuckets(rows, WEEK)[dayIndex]?.focusS ?? NaN;

describe('focusBuckets', () => {
  // M4 case 19
  it('splits a session across midnight', () => {
    const rows = [session(at(2026, 10, 6, 23, 30), 50)];
    expect(focusOf(rows, 1)).toBe(30 * 60); // Tuesday
    expect(focusOf(rows, 2)).toBe(20 * 60); // Wednesday
  });

  // M4 case 23
  it('credits the part of a session that spilled in from before the period', () => {
    const rows = [session(at(2026, 10, 4, 23, 50), 30)]; // Sunday 23:50, into Monday
    expect(focusOf(rows, 0)).toBe(20 * 60);
  });

  it('a session that runs past the end of the period is clipped to it', () => {
    const rows = [session(at(2026, 10, 11, 23, 50), 30)]; // last Sunday, into next Monday
    expect(focusOf(rows, 6)).toBe(10 * 60);
    expect(totals(rows, WEEK).focusS).toBe(10 * 60);
  });

  // M4 case 21
  it('ignores a session still in flight', () => {
    const live = session(at(2026, 10, 7, 9), 25, { endedAt: null, outcome: null, actualFocusS: 0 });
    expect(focusOf([live], 2)).toBe(0);
    expect(totals([live], WEEK)).toMatchObject({ focusS: 0, stars: 0, endedEarly: 0 });
    expect(focusByTag([live], WEEK)).toEqual([]);
    expect(historyFor([live], WEEK)).toEqual([]);
  });
});

describe('totals', () => {
  // M4 case 20
  it('counts cancelled focus, but only completed sessions earn stars', () => {
    const rows = [
      session(at(2026, 10, 7, 9), 25),
      session(at(2026, 10, 7, 11), 10, { outcome: 'cancelled' }),
    ];
    expect(totals(rows, WEEK)).toMatchObject({
      focusS: 35 * 60,
      stars: 1,
      completed: 1,
      endedEarly: 1,
    });
  });

  // M4 case 22
  it('sums away time and averages without dividing by zero', () => {
    const rows = [
      session(at(2026, 10, 6, 9), 20, { awayMs: 120_000 }),
      session(at(2026, 10, 7, 9), 40, { awayMs: 30_000 }),
    ];
    const t = totals(rows, WEEK);
    expect(t.awayMs).toBe(150_000);
    expect(t.avgSessionS).toBe(30 * 60);

    const empty = totals([], WEEK);
    expect(empty).toEqual({
      focusS: 0,
      stars: 0,
      completed: 0,
      endedEarly: 0,
      avgSessionS: 0,
      awayMs: 0,
    });
  });

  // M4 case 23 — membership is by startedAt.
  it('does not count, or list, a session that began before the period', () => {
    const early = session(at(2026, 10, 4, 23, 50), 30);
    expect(totals([early], WEEK)).toMatchObject({ stars: 0, completed: 0, endedEarly: 0 });
    expect(totals([early], WEEK).focusS).toBe(20 * 60);
    expect(historyFor([early], WEEK)).toEqual([]);
  });
});

describe('focusByTag', () => {
  // M4 case 15
  it('sums to the headline total and puts the biggest first', () => {
    const rows = [
      session(at(2026, 10, 5, 9), 25, { tagId: 'writing' }),
      session(at(2026, 10, 6, 9), 50, { tagId: 'reading' }),
      session(at(2026, 10, 7, 9), 10),
      session(at(2026, 10, 7, 12), 15, { tagId: 'writing', outcome: 'cancelled' }),
    ];
    const byTag = focusByTag(rows, WEEK);
    expect(byTag).toEqual([
      { tagId: 'reading', focusS: 50 * 60 },
      { tagId: 'writing', focusS: 40 * 60 },
      { tagId: null, focusS: 10 * 60 },
    ]);
    expect(byTag.reduce((s, t) => s + t.focusS, 0)).toBe(totals(rows, WEEK).focusS);
  });
});

describe('historyFor', () => {
  // M4 case 16
  it('lists only sessions that began in the period, newest first', () => {
    const a = session(at(2026, 10, 5, 9), 25);
    const b = session(at(2026, 10, 9, 9), 25);
    const outside = session(at(2026, 10, 13, 9), 25);
    expect(historyFor([a, outside, b], WEEK).map((s) => s.id)).toEqual([b.id, a.id]);
  });
});
