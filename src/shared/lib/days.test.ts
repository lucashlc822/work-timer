import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addDays, dayKey, dayStart, overlapMs } from './days';

const at = (y: number, m: number, d: number, h = 0, min = 0): number =>
  new Date(y, m - 1, d, h, min).getTime();

describe('dayKey', () => {
  it('names the local day, zero-padded', () => {
    expect(dayKey(at(2026, 3, 5, 23, 59))).toBe('2026-03-05');
    expect(dayKey(at(2026, 12, 31, 0, 0))).toBe('2026-12-31');
  });
});

describe('dayStart and addDays', () => {
  it('start at local midnight, and add calendar days', () => {
    expect(dayStart(at(2026, 10, 8, 15, 30)).getTime()).toBe(at(2026, 10, 8));
    expect(addDays(new Date(at(2026, 10, 31)), 1).getTime()).toBe(at(2026, 11, 1));
    expect(addDays(new Date(at(2026, 10, 1)), -1).getTime()).toBe(at(2026, 9, 30));
  });
});

describe('overlapMs', () => {
  const session = (startedAt: number, focusMin: number, outcome: string | null = 'completed') => ({
    startedAt,
    actualFocusS: focusMin * 60,
    endedAt: outcome === null ? null : startedAt + focusMin * 60_000,
    outcome,
  });

  it('splits a session across midnight', () => {
    const s = session(at(2026, 10, 6, 23, 30), 50);
    expect(overlapMs(s, at(2026, 10, 6), at(2026, 10, 7))).toBe(30 * 60_000);
    expect(overlapMs(s, at(2026, 10, 7), at(2026, 10, 8))).toBe(20 * 60_000);
  });

  it('ignores a session still in flight, and a zero-length one', () => {
    expect(overlapMs(session(at(2026, 10, 6, 9), 30, null), 0, Infinity)).toBe(0);
    expect(overlapMs(session(at(2026, 10, 6, 9), 0), 0, Infinity)).toBe(0);
  });
});

describe('across a daylight-saving change', () => {
  const original = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'Europe/London';
  });
  afterAll(() => {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  });

  it('addDays lands on the next midnight even when the day is 23 hours', () => {
    // 2026-03-29: London springs forward.
    const sunday = new Date(2026, 2, 29);
    const next = addDays(sunday, 1);
    expect(next.getTime() - sunday.getTime()).toBe(23 * 3_600_000);
    expect([next.getHours(), next.getMinutes()]).toEqual([0, 0]);
    expect(dayKey(next.getTime())).toBe('2026-03-30');
  });
});
