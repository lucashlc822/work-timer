import type { SessionRow, TagRow, WorkTimerDb } from '@/shared/db';
import {
  isSeeded,
  newId,
  newSeed,
  SEED_DEVICE,
  SEED_TAG_NAMES,
  seedTagId,
  type Clock,
} from '@/shared/lib';

const DEMO_TAGS: ReadonlyArray<Pick<TagRow, 'name' | 'color'>> = [
  { name: 'Writing', color: 'lavender' },
  { name: 'Reading', color: 'mint' },
  { name: 'Admin', color: 'rose' },
];

const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]!;

/**
 * Dev-only: fill the past `days` days with plausible sessions so the stats
 * have something to show. Mostly completed, some ended early, spread over the
 * tags (three demo tags are created if there are none), with one session
 * crossing midnight last night. Returns how many sessions it wrote.
 */
export const seedHistory = async (db: WorkTimerDb, days: number, clock: Clock): Promise<number> => {
  const now = clock.now();

  let tags = (await db.tags.toArray()).filter((t) => t.archivedAt === null);
  if (tags.length === 0) {
    tags = DEMO_TAGS.map((t, i) => ({
      ...t,
      id: seedTagId(t.name),
      createdAt: now + i,
      updatedAt: now + i,
      archivedAt: null,
      syncedAt: null,
    }));
    await db.tags.bulkAdd(tags);
  }

  const rows: SessionRow[] = [];
  const add = (startedAt: number, plannedMin: number, o: Partial<SessionRow> = {}) => {
    const cancelled = o.outcome === 'cancelled';
    const focusS = cancelled
      ? Math.round(plannedMin * 60 * (0.3 + Math.random() * 0.5))
      : plannedMin * 60;
    if (startedAt + focusS * 1000 > now) return; // never seed the future
    rows.push({
      id: newId(),
      mode: 'countdown',
      plannedDurationS: plannedMin * 60,
      actualFocusS: focusS,
      startedAt,
      endedAt: startedAt + focusS * 1000,
      outcome: 'completed',
      awayMs: Math.random() < 0.3 ? Math.round(Math.random() * 6 * 60_000) : 0,
      tagId: Math.random() < 0.8 ? pick(tags).id : null,
      seed: newSeed(),
      device: SEED_DEVICE,
      clientCreatedAt: startedAt,
      syncedAt: null,
      ...o,
    });
  };

  for (let back = 0; back < days; back++) {
    if (Math.random() < 0.25) continue; // a day off
    const sessionsToday = 1 + Math.floor(Math.random() * 4);
    for (let i = 0; i < sessionsToday; i++) {
      const day = new Date(now);
      day.setDate(day.getDate() - back);
      day.setHours(8 + i * 3, Math.floor(Math.random() * 40), 0, 0);
      add(
        day.getTime(),
        pick([25, 25, 50, 90]),
        Math.random() < 0.2 ? { outcome: 'cancelled' } : {},
      );
    }
  }

  const lastNight = new Date(now);
  lastNight.setDate(lastNight.getDate() - 1);
  lastNight.setHours(23, 40, 0, 0);
  add(lastNight.getTime(), 50);

  await db.sessions.bulkAdd(rows);
  return rows.length;
};

/**
 * Dev-only: remove everything `seedHistory` and the sky's `seed` wrote — the
 * sessions, the demo tags, and any Stardust already earned from those sessions
 * (rows made before the reconciler learned to skip them).
 */
export const clearSeeded = (db: WorkTimerDb): Promise<number> =>
  db.transaction('rw', db.sessions, db.tags, db.ledger, async () => {
    const ids = (await db.sessions.filter(isSeeded).primaryKeys());
    const idSet = new Set(ids);
    await db.ledger
      .filter((r) => r.reason === 'session' && r.ref !== null && idSet.has(r.ref))
      .delete();
    await db.tags.bulkDelete(SEED_TAG_NAMES.map(seedTagId));
    await db.sessions.bulkDelete(ids);
    return ids.length;
  });
