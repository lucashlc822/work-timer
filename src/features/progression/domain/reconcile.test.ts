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
