import { describe, expect, it } from 'vitest';

import { groupByDay } from './ledgerDays';

const at = (y: number, m: number, d: number, h: number): number =>
  new Date(y, m - 1, d, h).getTime();

describe('groupByDay', () => {
  it('splits newest-first rows into runs by local day, keeping order', () => {
    const rows = [
      { id: 'a', createdAt: at(2026, 11, 9, 22) },
      { id: 'b', createdAt: at(2026, 11, 9, 8) },
      { id: 'c', createdAt: at(2026, 11, 8, 23) },
      { id: 'd', createdAt: at(2026, 11, 7, 1) },
    ];
    const groups = groupByDay(rows);
    expect(groups.map((g) => g.key)).toEqual(['2026-11-09', '2026-11-08', '2026-11-07']);
    expect(groups.map((g) => g.rows.map((r) => r.id))).toEqual([['a', 'b'], ['c'], ['d']]);
    expect(groups[0]?.at).toBe(rows[0]?.createdAt);
  });

  it('puts either side of local midnight on different days', () => {
    const groups = groupByDay([
      { createdAt: new Date(2026, 10, 9, 0, 0, 1).getTime() },
      { createdAt: new Date(2026, 10, 8, 23, 59, 59).getTime() },
    ]);
    expect(groups).toHaveLength(2);
  });

  it('is empty for no rows', () => {
    expect(groupByDay([])).toEqual([]);
  });
});
