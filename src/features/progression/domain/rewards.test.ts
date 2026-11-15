import { describe, expect, it } from 'vitest';

import type { SessionRow } from '@/shared/db';
import { SEED_DEVICE } from '@/shared/lib';

import { expectedRows } from './reconcile';
import { lineLabel, rewardableSessions, rewardSummary, sessionRewards } from './rewards';

const USER = '11111111-1111-4111-8111-111111111111';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Mid-morning, local time, so a session never crosses midnight. */
const TODAY = new Date(2026, 10, 13, 10).getTime();

const session = (o: Partial<SessionRow> = {}): SessionRow => {
  const startedAt = o.startedAt ?? TODAY;
  const actualFocusS = o.actualFocusS ?? 1500;
  return {
    id: crypto.randomUUID(),
    mode: 'countdown',
    plannedDurationS: actualFocusS,
    actualFocusS,
    startedAt,
    endedAt: startedAt + actualFocusS * 1000,
    outcome: 'completed',
    awayMs: 0,
    tagId: null,
    seed: 'seed',
    device: 'desktop/app',
    clientCreatedAt: startedAt,
    syncedAt: null,
    ...o,
  };
};

const NOW = TODAY + 2 * HOUR;
const noLedger = new Map<string, number>();

const rewardsOf = (sessions: SessionRow[], ids: string[], extra = {}) =>
  sessionRewards({
    userId: USER,
    sessions,
    sessionIds: new Set(ids),
    now: NOW,
    ledger: noLedger,
    ...extra,
  });

describe('sessionRewards', () => {
  it('a first session: only its own Stardust (case 1)', () => {
    const s = session();
    expect(rewardsOf([s], [s.id])).toEqual({
      lines: [{ kind: 'session', delta: 25, minutes: 25 }],
      total: 25,
    });
  });

  it('the session that tips the day over its goal shows the goal bonus (case 2)', () => {
    const earlier = session({ actualFocusS: 40 * 60, startedAt: TODAY - 2 * HOUR });
    const s = session();
    const r = rewardsOf([earlier, s], [s.id]);
    expect(r.lines).toEqual([
      { kind: 'session', delta: 25, minutes: 25 },
      { kind: 'goal', delta: 20 },
    ]);
    expect(r.total).toBe(45);
  });

  it('a goal paid before this session (then raised) is not offered again (case 3)', () => {
    const earlier = session({ actualFocusS: 40 * 60, startedAt: TODAY - 2 * HOUR });
    const s = session();
    // The goal row as the reconciler wrote it when 30 min reached the old goal.
    const goalRow = expectedRows({ userId: USER, sessions: [earlier], goalMin: 30, now: NOW }).find(
      (r) => r.reason === 'goal',
    )!;
    const r = rewardsOf([earlier, s], [s.id], {
      ledger: new Map([[goalRow.id, goalRow.createdAt]]),
    });
    expect(r.lines.map((l) => l.kind)).toEqual(['session']);
  });

  it('keeps a goal line already paid for this very session (the reconciler got there first)', () => {
    const earlier = session({ actualFocusS: 40 * 60, startedAt: TODAY - 2 * HOUR });
    const s = session();
    const goalRow = expectedRows({ userId: USER, sessions: [earlier, s], now: NOW }).find(
      (r) => r.reason === 'goal',
    )!;
    const r = rewardsOf([earlier, s], [s.id], {
      ledger: new Map([[goalRow.id, goalRow.createdAt]]),
    });
    expect(r.lines.map((l) => l.kind)).toEqual(['session', 'goal']);
  });

  it('the first session of a third day in a row shows the streak; a second that day does not (case 4)', () => {
    const before = [session({ startedAt: TODAY - 2 * DAY }), session({ startedAt: TODAY - DAY })];
    const first = session();
    const r = rewardsOf([...before, first], [first.id]);
    expect(r.lines).toContainEqual({ kind: 'streak', delta: 30, days: 3 });

    const second = session({ startedAt: TODAY + HOUR });
    const r2 = rewardsOf([...before, first, second], [second.id]);
    expect(r2.lines.map((l) => l.kind)).toEqual(['session']);
  });

  it('a constellation these sessions finished is a line, by its tier (case 5)', () => {
    const s = session();
    const r = rewardsOf([s], [s.id], {
      finished: [{ choiceId: 'c1', tier: 'easy', completedAt: s.endedAt!, name: 'The Kite' }],
    });
    expect(r.lines).toContainEqual({ kind: 'constellation', delta: 25, name: 'The Kite' });
    expect(r.total).toBe(50);
  });

  it('says nothing for an early ending, a seeded session or an unknown id', () => {
    const early = session({ outcome: 'cancelled', actualFocusS: 600 });
    expect(rewardsOf([early], [early.id]).lines).toEqual([]);
    const seeded = session({ device: SEED_DEVICE });
    expect(rewardsOf([seeded], [seeded.id]).lines).toEqual([]);
    expect(rewardsOf([session()], ['nope']).total).toBe(0);
  });

  it('adds up a Pomodoro run as one focus line', () => {
    const a = session({ startedAt: TODAY - HOUR });
    const b = session();
    const r = rewardsOf([a, b], [a.id, b.id]);
    expect(r.lines[0]).toEqual({ kind: 'session', delta: 50, minutes: 50 });
  });

  it('matches what the reconciler pays: the total equals the new ledger rows', () => {
    const before = [
      session({ startedAt: TODAY - 2 * DAY }),
      session({ startedAt: TODAY - DAY }),
      session({ actualFocusS: 40 * 60, startedAt: TODAY - 2 * HOUR }),
    ];
    const s = session();
    const paid = new Set(
      expectedRows({ userId: USER, sessions: before, now: NOW }).map((r) => r.id),
    );
    const added = expectedRows({ userId: USER, sessions: [...before, s], now: NOW })
      .filter((r) => !paid.has(r.id))
      .reduce((n, r) => n + r.delta, 0);
    expect(rewardsOf([...before, s], [s.id]).total).toBe(added);
  });
});

describe('rewardableSessions', () => {
  it('keeps ended, unseeded sessions only', () => {
    const kept = session();
    const rows = [
      kept,
      session({ outcome: null, endedAt: null }),
      session({ device: SEED_DEVICE }),
    ];
    expect(rewardableSessions(rows)).toEqual([kept]);
  });
});

describe('the words', () => {
  it('labels each line', () => {
    expect(lineLabel({ kind: 'session', delta: 25, minutes: 25 })).toBe('Focus · 25 min');
    expect(lineLabel({ kind: 'goal', delta: 20 })).toBe('Daily goal reached');
    expect(lineLabel({ kind: 'streak', delta: 30, days: 3 })).toBe('3-day streak');
    expect(lineLabel({ kind: 'constellation', delta: 25, name: 'The Kite' })).toBe(
      'The Kite complete',
    );
  });

  it('sums up in one sentence (case 7)', () => {
    expect(rewardSummary({ lines: [{ kind: 'session', delta: 25, minutes: 25 }], total: 25 })).toBe(
      'Earned 25 Stardust.',
    );
    expect(
      rewardSummary({
        lines: [
          { kind: 'session', delta: 25, minutes: 25 },
          { kind: 'goal', delta: 20 },
        ],
        total: 45,
      }),
    ).toBe("Earned 45 Stardust: 25 for focus, 20 for reaching today's goal.");
    expect(rewardSummary({ lines: [], total: 0 })).toBe('');
  });
});
