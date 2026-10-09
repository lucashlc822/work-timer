import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { bucketsFor, isCurrent, periodContaining, shiftPeriod } from './period';

/** Local time, so the tests mean the same thing in any time zone. */
const at = (y: number, m: number, d: number, h = 0, min = 0): number =>
  new Date(y, m - 1, d, h, min).getTime();

describe('periodContaining', () => {
  // M4 case 12
  it('a week runs Monday to the next Monday', () => {
    const p = periodContaining('week', at(2026, 10, 7, 15)); // a Wednesday
    expect(p.start).toBe(at(2026, 10, 5));
    expect(p.end).toBe(at(2026, 10, 12));
  });

  it('a Sunday belongs to the week that began the Monday before', () => {
    const p = periodContaining('week', at(2026, 10, 11, 23, 59));
    expect(p.start).toBe(at(2026, 10, 5));
  });

  it('a Monday at midnight starts its own week', () => {
    expect(periodContaining('week', at(2026, 10, 5)).start).toBe(at(2026, 10, 5));
  });

  it('a month runs from the 1st to the 1st of the next', () => {
    const p = periodContaining('month', at(2026, 10, 7, 15));
    expect(p.start).toBe(at(2026, 10, 1));
    expect(p.end).toBe(at(2026, 11, 1));
  });

  it('"all time" runs from the first session’s day to the end of today', () => {
    const p = periodContaining('all', at(2026, 10, 7, 15), at(2026, 3, 14, 9, 30));
    expect(p.start).toBe(at(2026, 3, 14));
    expect(p.end).toBe(at(2026, 10, 8));
  });

  it('"all time" with no sessions is just today', () => {
    const p = periodContaining('all', at(2026, 10, 7, 15), null);
    expect(p.start).toBe(at(2026, 10, 7));
    expect(p.end).toBe(at(2026, 10, 8));
  });
});

describe('shiftPeriod', () => {
  // M4 case 12
  it('steps a month back across a year boundary', () => {
    const jan = periodContaining('month', at(2026, 1, 15));
    const dec = shiftPeriod(jan, -1);
    expect(dec.start).toBe(at(2025, 12, 1));
    expect(dec.end).toBe(at(2026, 1, 1));
  });

  it('steps a week forward and back to where it started', () => {
    const week = periodContaining('week', at(2026, 10, 7));
    expect(shiftPeriod(shiftPeriod(week, 1), -1)).toEqual(week);
    expect(shiftPeriod(week, 1).start).toBe(at(2026, 10, 12));
  });

  it('"all time" has no neighbours', () => {
    const all = periodContaining('all', at(2026, 10, 7), at(2026, 1, 1));
    expect(shiftPeriod(all, -1)).toBe(all);
  });
});

describe('isCurrent', () => {
  it('is true only for the period containing now', () => {
    const now = at(2026, 10, 7, 12);
    const week = periodContaining('week', now);
    expect(isCurrent(week, now)).toBe(true);
    expect(isCurrent(shiftPeriod(week, -1), now)).toBe(false);
    expect(isCurrent(shiftPeriod(week, 1), now)).toBe(false);
  });
});

describe('bucketsFor', () => {
  it('a week is seven day-bars that tile the period', () => {
    const p = periodContaining('week', at(2026, 10, 7));
    const buckets = bucketsFor(p);
    expect(buckets).toHaveLength(7);
    expect(buckets[0]?.start).toBe(p.start);
    expect(buckets[6]?.end).toBe(p.end);
    for (let i = 1; i < buckets.length; i++) expect(buckets[i]?.start).toBe(buckets[i - 1]?.end);
  });

  it('a month has one bar per day of that month', () => {
    expect(bucketsFor(periodContaining('month', at(2026, 2, 10)))).toHaveLength(28);
    expect(bucketsFor(periodContaining('month', at(2028, 2, 10)))).toHaveLength(29);
    expect(bucketsFor(periodContaining('month', at(2026, 10, 10)))).toHaveLength(31);
  });

  it('"all time" has one bar per calendar month, clamped to the period', () => {
    const p = periodContaining('all', at(2026, 10, 7), at(2026, 8, 20));
    const buckets = bucketsFor(p);
    expect(buckets).toHaveLength(3); // Aug, Sep, Oct
    expect(buckets[0]?.start).toBe(at(2026, 8, 20));
    expect(buckets[0]?.end).toBe(at(2026, 9, 1));
    expect(buckets[2]?.end).toBe(p.end);
  });
});

// M4 case 13 — a week with a clock change still has seven bars, each on a midnight.
describe('across a daylight-saving change', () => {
  const original = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'Europe/London';
  });
  afterAll(() => {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  });

  it('the zone really has the change this test depends on', () => {
    // 2026-03-29: London springs forward, so that Sunday is 23 hours long.
    const sunday = new Date(2026, 2, 29).getTime();
    const monday = new Date(2026, 2, 30).getTime();
    expect(monday - sunday).toBe(23 * 3_600_000);
  });

  it('has seven day-bars, each starting at a local midnight', () => {
    const p = periodContaining('week', at(2026, 3, 25)); // Mon 23 Mar – Mon 30 Mar
    const buckets = bucketsFor(p);
    expect(buckets).toHaveLength(7);
    for (const b of buckets) {
      const d = new Date(b.start);
      expect([d.getHours(), d.getMinutes()]).toEqual([0, 0]);
    }
    expect(p.end - p.start).toBe(7 * 24 * 3_600_000 - 3_600_000);
  });
});
