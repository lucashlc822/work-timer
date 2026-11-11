import { dayKey } from '@/shared/lib';

export interface DayGroup<T extends { createdAt: number }> {
  /** The local day, `'YYYY-MM-DD'`. */
  key: string;
  /** Any moment inside the day (the first row's), for labelling it. */
  at: number;
  rows: T[];
}

/**
 * Ledger rows, newest first, split into runs by local calendar day. Order is
 * kept as given: a day is a heading over the rows that fall on it, so a list
 * that is already newest-first stays newest-first inside and between days.
 */
export const groupByDay = <T extends { createdAt: number }>(rows: readonly T[]): DayGroup<T>[] => {
  const groups: DayGroup<T>[] = [];
  for (const row of rows) {
    const key = dayKey(row.createdAt);
    const last = groups[groups.length - 1];
    if (last !== undefined && last.key === key) last.rows.push(row);
    else groups.push({ key, at: row.createdAt, rows: [row] });
  }
  return groups;
};
