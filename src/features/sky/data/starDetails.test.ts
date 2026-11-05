import { liveQuery } from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createDb,
  META_KEYS,
  writeMeta,
  type PomodoroRunRow,
  type SessionRow,
  type TagRow,
  type WorkTimerDb,
} from '@/shared/db';

import { readStarDetailsInputs, starDetails, type StarDetailsInputs } from './starDetails';

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
const row = (o: Partial<SessionRow>): SessionRow => ({
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
const tag = (o: Partial<TagRow>): TagRow => ({
  id: crypto.randomUUID(),
  name: 'Writing',
  color: 'mint',
  createdAt: T0,
  updatedAt: T0,
  archivedAt: null,
  syncedAt: null,
  ...o,
});
const inputs = (o: Partial<StarDetailsInputs>): StarDetailsInputs => ({
  sessions: [],
  tags: [],
  activeRun: undefined,
  togetherNames: undefined,
  ...o,
});

describe('starDetails', () => {
  it('names a star’s tag, archived ones included, and none for an unknown tag', () => {
    const writing = tag({ name: 'Writing' });
    const old = tag({ name: 'Old project', color: 'rose', archivedAt: T0 });
    const a = row({ tagId: writing.id });
    const b = row({ tagId: old.id });
    const c = row({ tagId: 'gone' });
    const d = row({ tagId: null });

    const map = starDetails(inputs({ sessions: [a, b, c, d], tags: [writing, old] }));

    expect(map.get(a.id)?.tag).toEqual({ name: 'Writing', color: 'mint' });
    expect(map.get(b.id)?.tag).toEqual({ name: 'Old project', color: 'rose' });
    expect(map.get(c.id)?.tag).toBeNull();
    expect(map.get(d.id)?.tag).toBeNull();
  });

  it('places a Pomodoro block among the blocks its run completed', () => {
    const pomo = (runIndex: number, outcome: SessionRow['outcome'] = 'completed') =>
      row({ mode: 'pomodoro', runId: 'run-1', runIndex, outcome });
    const blocks = [pomo(1), pomo(2), pomo(3), pomo(4, 'cancelled')];

    const map = starDetails(inputs({ sessions: blocks }));

    // The cancelled fourth block earned no star, so the run is "of 3".
    expect(map.get(blocks[1]!.id)?.run).toEqual({ index: 2, total: 3 });
    expect(map.has(blocks[3]!.id)).toBe(false);
  });

  it('leaves the total open while the run is still going on this device', () => {
    const block = row({ mode: 'pomodoro', runId: 'run-live', runIndex: 2 });
    const activeRun = { id: 'run-live' } as PomodoroRunRow;

    const map = starDetails(inputs({ sessions: [block], activeRun }));

    expect(map.get(block.id)?.run).toEqual({ index: 2, total: null });
  });

  it('gives a countdown session no run', () => {
    const s = row({});
    expect(starDetails(inputs({ sessions: [s] })).get(s.id)?.run).toBeNull();
  });

  it('remembers who you focused with, and says when this device never knew', () => {
    const known = row({ togetherId: 'room-1' });
    const unknown = row({ togetherId: 'room-2' });
    const solo = row({});

    const map = starDetails(
      inputs({
        sessions: [known, unknown, solo],
        togetherNames: { 'room-1': { names: ['mia'], startsAt: T0 } },
      }),
    );

    expect(map.get(known.id)?.together).toEqual({ names: ['mia'] });
    expect(map.get(unknown.id)?.together).toEqual({ names: null });
    expect(map.get(solo.id)?.together).toBeNull();
  });

  it('has nothing for sessions that made no star', () => {
    const s = row({ outcome: 'cancelled' });
    expect(starDetails(inputs({ sessions: [s] })).has(s.id)).toBe(false);
  });
});

describe('readStarDetailsInputs', () => {
  it('keeps a live query up to date as tags and remembered names change', async () => {
    const db = withDb();
    const writing = tag({ name: 'Writing' });
    const s = row({ tagId: writing.id, togetherId: 'room-1' });
    await db.sessions.add(s);

    const seen: { tag: string | null; names: readonly string[] | null }[] = [];
    const sub = liveQuery(() => readStarDetailsInputs(db)).subscribe((i) => {
      const d = starDetails(i).get(s.id);
      seen.push({ tag: d?.tag?.name ?? null, names: d?.together?.names ?? null });
    });
    const settle = () => new Promise((r) => setTimeout(r, 60));

    await settle();
    await db.tags.add(writing);
    await settle();
    await writeMeta(db, META_KEYS.togetherNames, { 'room-1': { names: ['mia'], startsAt: T0 } });
    await settle();
    sub.unsubscribe();

    expect(seen[0]).toEqual({ tag: null, names: null });
    expect(seen.some((x) => x.tag === 'Writing' && x.names === null)).toBe(true);
    expect(seen.at(-1)).toEqual({ tag: 'Writing', names: ['mia'] });
  });
});
