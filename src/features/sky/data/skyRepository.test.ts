import { afterEach, describe, expect, it } from 'vitest';

import { createDb, type SessionRow, type WorkTimerDb } from '@/shared/db';
import { createTestClock, isSeeded, isSeededConstellation } from '@/shared/lib';

import { CATALOGUE } from '../domain/catalogue';
import { deriveSky } from '../domain/derive';
import { STAR_STYLE_KEYS } from '../domain/starStyles';
import { tierRules } from '../domain/tiers';
import {
  chooseConstellation,
  readSkyInputs,
  seedCompletedSessions,
  seedSky,
} from './skyRepository';

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

  describe('seedSky', () => {
    const skyOf = async (db: WorkTimerDb) => {
      const { sessions, choices } = await readSkyInputs(db);
      return deriveSky(sessions, choices, tierRules(false));
    };

    it('builds one finished constellation per catalogue shape, none wandering', async () => {
      const db = withDb();
      const total = await seedSky(db, { shapes: 'all' }, createTestClock(T0));

      const sky = await skyOf(db);
      expect(total).toBe(Object.keys(CATALOGUE).length);
      expect(sky.constellations).toHaveLength(total);
      expect(sky.constellations.every((c) => c.complete)).toBe(true);
      expect(sky.wandering).toEqual([]);
      expect(sky.constellations.map((c) => c.choice.shapeId).sort()).toEqual(
        Object.keys(CATALOGUE).sort(),
      );
    });

    it('leaves each constellation one star short with complete: false', async () => {
      const db = withDb();
      await seedSky(db, { shapes: ['kite', 'whale'], complete: false }, createTestClock(T0));

      const sky = await skyOf(db);
      expect(sky.constellations.every((c) => !c.complete)).toBe(true);
      for (const c of sky.constellations) {
        expect(c.stars).toHaveLength(c.def.shape.points.length - 1);
      }
    });

    it('adds generated constellations after the catalogue ones', async () => {
      const db = withDb();
      await seedSky(db, { shapes: ['kite'], generated: 3 }, createTestClock(T0));

      const sky = await skyOf(db);
      expect(sky.constellations.map((c) => c.def.source)).toEqual([
        'catalogue',
        'generated',
        'generated',
        'generated',
      ]);
      expect(sky.constellations.every((c) => c.complete)).toBe(true);
    });

    it('is reproducible: the same options draw the same stars in the same places', async () => {
      const a = withDb();
      const b = withDb();
      await seedSky(a, { shapes: 'all', generated: 2, styles: true }, createTestClock(T0));
      await seedSky(b, { shapes: 'all', generated: 2, styles: true }, createTestClock(T0));

      const seeds = async (db: WorkTimerDb) =>
        (await skyOf(db)).constellations.map((c) => c.stars.map((s) => [s.seed, s.starStyle]));
      expect(await seeds(a)).toEqual(await seeds(b));
    });

    it('replaces an earlier fixture instead of stacking a second one', async () => {
      const db = withDb();
      const clock = createTestClock(T0);
      await seedSky(db, { shapes: 'all' }, clock);
      const sessions = await db.sessions.count();
      await seedSky(db, { shapes: 'all' }, clock);

      expect(await db.constellations.count()).toBe(Object.keys(CATALOGUE).length);
      expect(await db.sessions.count()).toBe(sessions);
    });

    it('cycles every star style through the stars when asked', async () => {
      const db = withDb();
      await seedSky(db, { shapes: ['kite', 'arrow'], styles: true }, createTestClock(T0));

      const styles = new Set((await db.sessions.toArray()).map((s) => s.starStyle));
      expect([...styles].sort()).toEqual([...STAR_STYLE_KEYS].sort());
    });

    it('stays local-only and in the past, and leaves real rows alone', async () => {
      const db = withDb();
      const clock = createTestClock(T0);
      const mine = row({});
      await db.sessions.add(mine);
      await seedSky(db, { shapes: 'all', generated: 1 }, clock);

      const choices = await db.constellations.toArray();
      expect(choices.every((c) => isSeededConstellation(c.id) && c.syncedAt !== null)).toBe(true);
      const seeded = (await db.sessions.toArray()).filter((s) => s.id !== mine.id);
      expect(seeded.length).toBeGreaterThan(0);
      expect(seeded.every((s) => isSeeded(s) && (s.endedAt as number) < clock.now())).toBe(true);
      expect(await db.sessions.get(mine.id)).toBeDefined();
    });
  });
});
