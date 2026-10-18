import { afterEach, describe, expect, it } from 'vitest';

import { createDb, META_KEYS, writeMeta, type WorkTimerDb } from '@/shared/db';
import { createTestClock } from '@/shared/lib';

import { finishSession, startSession } from './sessionRepository';

const opened: WorkTimerDb[] = [];
const withDb = (): WorkTimerDb => {
  const db = createDb(`test-${crypto.randomUUID()}`);
  opened.push(db);
  return db;
};
afterEach(async () => {
  while (opened.length > 0) await opened.pop()?.delete();
});

const START = 1_700_000_000_000;
const draft = { mode: 'countdown' as const, plannedDurationS: 1500, tagId: null };
const ctx = () => ({ clock: createTestClock(START), device: 'desktop/app' });
const completed = { outcome: 'completed' as const, endedAt: START + 1_500_000, actualFocusS: 1500 };

/** Start one session and finish it with `end`, returning the stored row. */
const run = async (db: WorkTimerDb, end: Parameters<typeof finishSession>[2]) => {
  const { session } = await startSession(db, draft, ctx());
  await finishSession(db, session.id, end);
  return db.sessions.get(session.id);
};

// Case 10
describe('a finished session and the equipped star style', () => {
  it('is stamped with the style equipped when it completes', async () => {
    const db = withDb();
    await writeMeta(db, META_KEYS.starStyle, 'ember');
    expect(await run(db, completed)).toMatchObject({ outcome: 'completed', starStyle: 'ember' });
  });

  it('has no style when none was ever equipped (the sky then draws classic)', async () => {
    const row = await run(withDb(), completed);
    expect(row).toMatchObject({ outcome: 'completed' });
    expect(row).not.toHaveProperty('starStyle');
  });

  it('keeps its style when another is equipped afterwards', async () => {
    const db = withDb();
    await writeMeta(db, META_KEYS.starStyle, 'ember');
    const row = await run(db, completed);

    await writeMeta(db, META_KEYS.starStyle, 'crystal');
    expect((await db.sessions.get(row!.id))?.starStyle).toBe('ember');

    // Finishing again is a no-op: the row is never rewritten.
    await finishSession(db, row!.id, completed);
    expect((await db.sessions.get(row!.id))?.starStyle).toBe('ember');
  });

  it('stamps each session with the style of its own moment', async () => {
    const db = withDb();
    await writeMeta(db, META_KEYS.starStyle, 'ember');
    const first = await run(db, completed);
    await writeMeta(db, META_KEYS.starStyle, 'aurora');
    const second = await run(db, completed);
    expect([first?.starStyle, second?.starStyle]).toEqual(['ember', 'aurora']);
  });

  it('gives an early ending no style: it earns no star', async () => {
    const db = withDb();
    await writeMeta(db, META_KEYS.starStyle, 'ember');
    const row = await run(db, { outcome: 'cancelled', endedAt: START + 61_000, actualFocusS: 61 });
    expect(row).not.toHaveProperty('starStyle');
  });
});
