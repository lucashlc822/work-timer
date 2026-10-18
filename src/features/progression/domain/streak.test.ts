import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { SessionRow } from '@/shared/db';

import { streakAt, streakRuns } from './streak';

const at = (y: number, m: number, d: number, h = 9, min = 0): number =>
  new Date(y, m - 1, d, h, min).getTime();

const session = (startedAt: number, o: Partial<SessionRow> = {}): SessionRow => ({
  id: crypto.randomUUID(),
  mode: 'countdown',
  plannedDurationS: 1500,
  actualFocusS: 1500,
  startedAt,
  endedAt: startedAt + 1_500_000,
  outcome: 'completed',
  awayMs: 0,
  tagId: null,
  seed: 'seed',
  device: 'desktop/app',
  clientCreatedAt: startedAt,
  syncedAt: null,
  ...o,
});

const onDays = (...days: number[]): SessionRow[] => days.map((d) => session(at(2026, 10, d)));

// Case 4 — streak counts consecutive local days with a completed session.
describe('streakAt', () => {
  it('counts consecutive days ending today', () => {
    expect(streakAt(onDays(6, 7, 8), at(2026, 10, 8, 20))).toBe(3);
  });

  it('stays alive today before the first session, counting up to yesterday', () => {
    expect(streakAt(onDays(6, 7), at(2026, 10, 8, 7))).toBe(2);
  });

  it('resets once a whole day is skipped', () => {
    expect(streakAt(onDays(5, 6), at(2026, 10, 8, 7))).toBe(0);
  });

  it('counts only the run that reaches today, not an older longer one', () => {
    expect(streakAt(onDays(1, 2, 3, 4, 7, 8), at(2026, 10, 8, 20))).toBe(2);
  });

  it('counts several sessions in a day once', () => {
    const rows = [...onDays(7, 8), session(at(2026, 10, 8, 15))];
    expect(streakAt(rows, at(2026, 10, 8, 20))).toBe(2);
  });

  it('does not count an early ending, or a session still running', () => {
    const rows = [
      ...onDays(6),
      session(at(2026, 10, 7), { outcome: 'cancelled' }),
      session(at(2026, 10, 8), { outcome: null, endedAt: null }),
    ];
    expect(streakAt(rows, at(2026, 10, 8, 20))).toBe(0);
  });

  it('credits a session that crosses midnight to the day it started', () => {
    const late = session(at(2026, 10, 7, 23, 50), {
      actualFocusS: 3000,
      endedAt: at(2026, 10, 8, 0, 40),
    });
    expect(streakAt([...onDays(6), late], at(2026, 10, 7, 23, 55))).toBe(2);
    expect(streakAt([...onDays(6), late], at(2026, 10, 8, 20))).toBe(2);
  });

  it('is 0 with no sessions', () => {
    expect(streakAt([], at(2026, 10, 8))).toBe(0);
  });
});

describe('streakRuns', () => {
  it('lists every run, oldest first', () => {
    const runs = streakRuns(onDays(9, 1, 2, 3, 5, 6));
    expect(runs.map((r) => [r.startDay, r.length])).toEqual([
      ['2026-10-01', 3],
      ['2026-10-05', 2],
      ['2026-10-09', 1],
    ]);
  });

  it('joins runs across a month boundary', () => {
    const rows = [session(at(2026, 10, 31)), session(at(2026, 11, 1))];
    expect(streakRuns(rows).map((r) => r.length)).toEqual([2]);
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

  it('keeps a run going through the 23-hour day', () => {
    // 28, 29 (23 hours long) and 30 March 2026.
    const rows = [28, 29, 30].map((d) => session(at(2026, 3, d, 0, 30)));
    expect(streakAt(rows, at(2026, 3, 30, 12))).toBe(3);
  });

  it('keeps a run going through the 25-hour day', () => {
    // 2026-10-25: London falls back.
    const rows = [24, 25, 26].map((d) => session(at(2026, 10, d, 23, 30)));
    expect(streakAt(rows, at(2026, 10, 26, 23, 45))).toBe(3);
  });
});
