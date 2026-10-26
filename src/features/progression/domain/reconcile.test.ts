import { describe, expect, it } from 'vitest';

import type { SessionRow } from '@/shared/db';
import { stableId } from '@/shared/lib';

import { expectedRows, sessionKey } from './reconcile';

const T0 = Date.parse('2026-10-08T09:00:00.000Z');
const USER = '11111111-1111-4111-8111-111111111111';

const session = (o: Partial<SessionRow> = {}): SessionRow => ({
  id: crypto.randomUUID(),
  mode: 'countdown',
  plannedDurationS: 1500,
  actualFocusS: 1500,
  startedAt: T0,
  endedAt: T0 + 1_500_000,
  outcome: 'completed',
  awayMs: 0,
  tagId: null,
  seed: 'seed',
  device: 'desktop/app',
  clientCreatedAt: T0,
  syncedAt: null,
  ...o,
});

describe('expectedRows', () => {
  it('owes one +25 row for a completed 25-minute session', () => {
    const s = session();
    expect(expectedRows({ userId: USER, sessions: [s] })).toEqual([
      {
        id: stableId(sessionKey(USER, s.id)),
        reason: 'session',
        delta: 25,
        ref: s.id,
        createdAt: s.endedAt,
        syncedAt: null,
      },
    ]);
  });

  it('owes nothing for a session ended early, in flight, or under a minute', () => {
    const rows = expectedRows({
      userId: USER,
      sessions: [
        session({ outcome: 'cancelled', actualFocusS: 600 }),
        session({ outcome: null, endedAt: null }),
        session({ actualFocusS: 45 }),
      ],
    });
    expect(rows).toEqual([]);
  });

  it('pays each completed Pomodoro block for itself', () => {
    const runId = crypto.randomUUID();
    const blocks = [1, 2, 3].map((runIndex) =>
      session({ mode: 'pomodoro', runId, runIndex, actualFocusS: 1500 }),
    );
    const rows = expectedRows({ userId: USER, sessions: blocks });
    expect(rows.map((r) => r.delta)).toEqual([25, 25, 25]);
    expect(new Set(rows.map((r) => r.id)).size).toBe(3);
  });

  it('is deterministic: the same session always owes the same row', () => {
    const s = session();
    expect(expectedRows({ userId: USER, sessions: [s] })).toEqual(
      expectedRows({ userId: USER, sessions: [{ ...s, syncedAt: T0 + 9 }] }),
    );
  });

  it('gives two accounts different ids even for the same session id', () => {
    // The server's primary key is global: a shared id would drop one person's row.
    const s = session();
    const other = '22222222-2222-4222-8222-222222222222';
    const [mine] = expectedRows({ userId: USER, sessions: [s] });
    const [theirs] = expectedRows({ userId: other, sessions: [s] });
    expect(mine?.id).not.toBe(theirs?.id);
  });
});

describe('the focus-together bonus (M7)', () => {
  const END = Date.parse('2026-10-24T10:25:00Z');
  const win = { roomId: 'room-1', endsAt: END };

  it('pays +10 once per room everyone completed, dated at the shared end', () => {
    const rows = expectedRows({ userId: USER, sessions: [], togetherWins: [win] });
    expect(rows).toEqual([
      {
        id: stableId(`${USER}:together:room-1`),
        reason: 'together',
        delta: 10,
        ref: 'room-1',
        createdAt: END,
        syncedAt: null,
      },
    ]);
  });

  it('is the same row on every device and every run, and per person', () => {
    const once = expectedRows({ userId: USER, sessions: [], togetherWins: [win] });
    const again = expectedRows({ userId: USER, sessions: [], togetherWins: [win, win] });
    expect(new Set(again.map((r) => r.id))).toEqual(new Set(once.map((r) => r.id)));
    const friend = expectedRows({ userId: 'other-user', sessions: [], togetherWins: [win] });
    expect(friend[0]!.id).not.toBe(once[0]!.id);
  });

  it('pays nothing without a win', () => {
    expect(expectedRows({ userId: USER, sessions: [] })).toEqual([]);
  });
});

// S5.1 (M7 phase 5)
describe('the shared constellation bonus', () => {
  const DONE = Date.parse('2026-10-26T10:00:00Z');

  it('pays the solo amount for its tier, once per shared constellation, dated at its last star', () => {
    const rows = expectedRows({
      userId: USER,
      sessions: [],
      sharedCompletions: [
        { sharedId: 'sh-easy', tier: 'easy', completedAt: DONE },
        { sharedId: 'sh-hard', tier: 'hard', completedAt: DONE + 1 },
      ],
    });
    expect(rows).toEqual([
      {
        id: stableId(`${USER}:shared:sh-easy`),
        reason: 'shared',
        delta: 25,
        ref: 'sh-easy',
        createdAt: DONE,
        syncedAt: null,
      },
      {
        id: stableId(`${USER}:shared:sh-hard`),
        reason: 'shared',
        delta: 200,
        ref: 'sh-hard',
        createdAt: DONE + 1,
        syncedAt: null,
      },
    ]);
  });

  it('is the same row on every device and every run, and its own row for each member', () => {
    const done = { sharedId: 'sh-1', tier: 'medium' as const, completedAt: DONE };
    const once = expectedRows({ userId: USER, sessions: [], sharedCompletions: [done] });
    const again = expectedRows({ userId: USER, sessions: [], sharedCompletions: [done, done] });
    expect(new Set(again.map((r) => r.id))).toEqual(new Set(once.map((r) => r.id)));
    const partner = expectedRows({ userId: 'other-user', sessions: [], sharedCompletions: [done] });
    expect(partner[0]!.id).not.toBe(once[0]!.id);
    expect(partner[0]!.delta).toBe(75);
  });

  it('never shares an id with a personal constellation of the same id', () => {
    const shared = expectedRows({
      userId: USER,
      sessions: [],
      sharedCompletions: [{ sharedId: 'x', tier: 'easy', completedAt: DONE }],
    });
    const personal = expectedRows({
      userId: USER,
      sessions: [],
      completions: [{ choiceId: 'x', tier: 'easy', completedAt: DONE }],
    });
    expect(shared[0]!.id).not.toBe(personal[0]!.id);
  });
});
