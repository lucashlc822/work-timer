import { describe, expect, it } from 'vitest';

import type { SessionRow } from '@/shared/db';

import { expectedRows, type ConstellationCompletion } from './reconcile';

const USER = '11111111-1111-4111-8111-111111111111';
const T0 = Date.parse('2026-10-08T09:00:00.000Z');

const at = (y: number, m: number, d: number, h = 9, min = 0): number =>
  new Date(y, m - 1, d, h, min).getTime();

/** A completed session on 2026-10-`d`, starting at hour `h`. */
const day = (d: number, focusMin = 25, h = 9): SessionRow => {
  const startedAt = at(2026, 10, d, h);
  return {
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
  };
};

const only = (rows: ReturnType<typeof expectedRows>, reason: string) =>
  rows.filter((r) => r.reason === reason);

// Case 5 — the daily goal bonus.
describe('daily goal bonus', () => {
  const now = at(2026, 10, 8, 20);

  it('pays 20 once on the day the goal is reached', () => {
    const sessions = [day(8, 25, 9), day(8, 25, 10)];
    const rows = only(expectedRows({ userId: USER, sessions, goalMin: 40, now }), 'goal');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ delta: 20, ref: '2026-10-08' });
    // Reached when the second session ended.
    expect(rows[0]?.createdAt).toBe(sessions[1]?.endedAt);
  });

  it('pays nothing when the day falls short', () => {
    const rows = expectedRows({ userId: USER, sessions: [day(8, 25)], goalMin: 60, now });
    expect(only(rows, 'goal')).toHaveLength(0);
  });

  it('pays yesterday too, but never older days', () => {
    const sessions = [day(8), day(7), day(5)];
    const rows = only(expectedRows({ userId: USER, sessions, goalMin: 20, now }), 'goal');
    expect(rows.map((r) => r.ref).sort()).toEqual(['2026-10-07', '2026-10-08']);
  });

  it('lowering the goal later pays no days before yesterday', () => {
    const sessions = [day(3, 25), day(4, 25), day(5, 25)];
    const lowered = expectedRows({ userId: USER, sessions, goalMin: 5, now });
    expect(only(lowered, 'goal')).toHaveLength(0);
  });

  it('owes the identical row later in the day, so a repeat inserts nothing new', () => {
    const sessions = [day(8, 60)];
    const a = expectedRows({ userId: USER, sessions, goalMin: 60, now });
    const b = expectedRows({ userId: USER, sessions, goalMin: 60, now: now + 3_600_000 });
    expect(only(a, 'goal')).toEqual(only(b, 'goal'));
    expect(only(a, 'goal')).toHaveLength(1);
  });
});

// Case 6 — streak milestones.
describe('streak milestone bonuses', () => {
  const now = at(2026, 10, 30, 20);
  const run = (...days: number[]) => days.map((d) => day(d));

  it('pays 30 at 3 days, then 70 more at 7, each once', () => {
    const three = only(expectedRows({ userId: USER, sessions: run(1, 2, 3), now }), 'streak');
    expect(three.map((r) => [r.ref, r.delta])).toEqual([['2026-10-01:3', 30]]);

    const seven = only(
      expectedRows({ userId: USER, sessions: run(1, 2, 3, 4, 5, 6, 7), now }),
      'streak',
    );
    expect(seven.map((r) => r.delta)).toEqual([30, 70]);
  });

  it('pays nothing for a run shorter than 3', () => {
    expect(only(expectedRows({ userId: USER, sessions: run(1, 2), now }), 'streak')).toHaveLength(
      0,
    );
  });

  it('pays a new run again after a skipped day', () => {
    const rows = only(
      expectedRows({ userId: USER, sessions: run(1, 2, 3, 5, 6, 7), now }),
      'streak',
    );
    expect(rows.map((r) => r.ref).sort()).toEqual(['2026-10-01:3', '2026-10-05:3']);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2);
  });

  it('dates a milestone to the end of the day it was reached', () => {
    const sessions = run(1, 2, 3);
    const [row] = only(expectedRows({ userId: USER, sessions, now }), 'streak');
    expect(row?.createdAt).toBe(sessions[2]?.endedAt);
  });

  it('does not count an early ending toward a run', () => {
    const sessions = [day(1), { ...day(2), outcome: 'cancelled' as const }, day(3)];
    expect(only(expectedRows({ userId: USER, sessions, now }), 'streak')).toHaveLength(0);
  });
});

// Case 6 — constellation bonuses.
describe('constellation bonuses', () => {
  const now = at(2026, 10, 8, 20);

  it('pays by tier, once per finished constellation', () => {
    const completions: ConstellationCompletion[] = [
      { choiceId: 'c-easy', tier: 'easy', completedAt: T0 },
      { choiceId: 'c-med', tier: 'medium', completedAt: T0 + 1 },
      { choiceId: 'c-hard', tier: 'hard', completedAt: T0 + 2 },
    ];
    const rows = only(
      expectedRows({ userId: USER, sessions: [], completions, now }),
      'constellation',
    );
    expect(rows.map((r) => [r.ref, r.delta])).toEqual([
      ['c-easy', 25],
      ['c-med', 75],
      ['c-hard', 200],
    ]);
    expect(rows.map((r) => r.createdAt)).toEqual([T0, T0 + 1, T0 + 2]);
  });

  it('keys the row on the account, like every other', () => {
    const completions: ConstellationCompletion[] = [
      { choiceId: 'c', tier: 'easy', completedAt: T0 },
    ];
    const mine = expectedRows({ userId: USER, sessions: [], completions, now });
    const theirs = expectedRows({
      userId: '22222222-2222-4222-8222-222222222222',
      sessions: [],
      completions,
      now,
    });
    expect(mine[0]?.id).not.toBe(theirs[0]?.id);
  });
});
