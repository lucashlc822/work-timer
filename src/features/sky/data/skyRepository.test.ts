import { afterEach, describe, expect, it } from 'vitest';

import { createDb, type SessionRow, type WorkTimerDb } from '@/shared/db';
import { createTestClock } from '@/shared/lib';

import { deriveSky } from '../domain/derive';
import { tierRules } from '../domain/tiers';
import { chooseConstellation, readSkyInputs, seedCompletedSessions } from './skyRepository';

const opened: WorkTimerDb[] = [];
const withDb = (): WorkTimerDb => {
  const db = createDb(`test-${crypto.randomUUID()}`);
  opened.push(db);
  return db;
};

afterEach(async () => {
  while (opened.length > 0) await opened.pop()?.delete();
});

const T0 = 1_700_000_000_000;

const row = (overrides: Partial<SessionRow>): SessionRow => ({
  id: crypto.randomUUID(),
  mode: 'countdown',
  plannedDurationS: 1500,
  actualFocusS: 1500,
  startedAt: T0,
  endedAt: T0 + 1_500_000,
  outcome: 'completed',
  awayMs: 0,
  tagId: null,
  seed: 'abcdef0123456789',
  device: 'desktop/app',
  clientCreatedAt: T0,
  syncedAt: null,
  ...overrides,
});

describe('skyRepository', () => {
  it('appends a choice stamped with the clock', async () => {
    const db = withDb();
    const clock = createTestClock(T0);

    const choice = await chooseConstellation(
      db,
      { source: 'catalogue', shapeId: 'kite', seed: null, tier: 'easy' },
      clock,
    );

    expect(choice.chosenAt).toBe(T0);
    expect(await db.constellations.get(choice.id)).toMatchObject({
      shapeId: 'kite',
      syncedAt: null,
    });
  });

  it('reads only completed sessions — never in-flight or cancelled ones', async () => {
    const db = withDb();
    const done = row({});
    await db.sessions.bulkAdd([
      done,
      row({ outcome: 'cancelled', endedAt: T0 + 60_000 }),
      row({ outcome: null, endedAt: null }),
    ]);

    const { sessions } = await readSkyInputs(db);

    expect(sessions.map((s) => s.id)).toEqual([done.id]);
  });

  it('seeds dev sessions that land in the current constellation', async () => {
    const db = withDb();
    const clock = createTestClock(T0);
    await chooseConstellation(
      db,
      { source: 'catalogue', shapeId: 'kite', seed: null, tier: 'easy' },
      clock,
    );

    await seedCompletedSessions(db, 4, 25, clock);

    const { sessions, choices } = await readSkyInputs(db);
    const sky = deriveSky(sessions, choices, tierRules(false));
    expect(sky.constellations[0]?.complete).toBe(true);
  });
});
