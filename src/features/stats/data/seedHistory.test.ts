import { afterEach, describe, expect, it } from 'vitest';

import { createDb, type SessionRow, type WorkTimerDb } from '@/shared/db';
import { createTestClock, SEED_DEVICE } from '@/shared/lib';
import { clearSeeded, seedHistory } from './seedHistory';

const opened: WorkTimerDb[] = [];
const newDb = (): WorkTimerDb => {
  const db = createDb(`test-${crypto.randomUUID()}`);
  opened.push(db);
  return db;
};
afterEach(async () => {
  while (opened.length > 0) await opened.pop()?.delete();
});

const NOW = Date.parse('2026-10-20T12:00:00.000Z');
const clock = createTestClock(NOW);

const real = (): SessionRow => ({
  id: crypto.randomUUID(),
  mode: 'countdown',
  plannedDurationS: 1500,
  actualFocusS: 1500,
  startedAt: NOW - 3_600_000,
  endedAt: NOW - 3_600_000 + 1_500_000,
  outcome: 'completed',
  awayMs: 0,
  tagId: null,
  seed: 'seed',
  device: 'desktop/app',
  clientCreatedAt: NOW - 3_600_000,
  syncedAt: null,
});

describe('clearSeeded', () => {
  it('removes sessions, demo tags and their old ledger rows, and nothing real', async () => {
    const db = newDb();
    await seedHistory(db, 7, clock);
    const seeded = await db.sessions.toArray();
    expect(seeded.every((s) => s.device === SEED_DEVICE)).toBe(true);
    // A row an older build had already earned from a seeded session.
    await db.ledger.add({
      id: crypto.randomUUID(),
      reason: 'session',
      delta: 25,
      ref: seeded[0]!.id,
      createdAt: NOW,
      syncedAt: null,
    });
    const keep = real();
    await db.sessions.add(keep);
    await db.ledger.add({
      id: crypto.randomUUID(),
      reason: 'session',
      delta: 25,
      ref: keep.id,
      createdAt: NOW,
      syncedAt: null,
    });

    expect(await clearSeeded(db)).toBe(seeded.length);
    expect((await db.sessions.toArray()).map((s) => s.id)).toEqual([keep.id]);
    expect(await db.tags.count()).toBe(0);
    const rows = await db.ledger.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ref: keep.id });
  });
});
