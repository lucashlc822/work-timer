// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { createDb, META_KEYS, readMeta, writeMeta, type WorkTimerDb } from '@/shared/db';

import type { FinishedConstellation } from '../domain/celebrate';
import {
  CELEBRATION_STAGGER_MS,
  HERO_CELEBRATION_DELAY_MS,
  useCelebrations,
} from './useCelebrations';

const opened: WorkTimerDb[] = [];
const withDb = (): WorkTimerDb => {
  const db = createDb(`test-${crypto.randomUUID()}`);
  opened.push(db);
  return db;
};
afterEach(async () => {
  while (opened.length > 0) await opened.pop()?.delete();
});

const done = (id: string, completedAt: number): FinishedConstellation => ({ id, completedAt });
const seenOf = (db: WorkTimerDb) => readMeta<string[]>(db, META_KEYS.celebratedConstellations);
const settle = () => new Promise((r) => setTimeout(r, 80));

describe('useCelebrations', () => {
  it('on first opening plays nothing, and records what was already finished', async () => {
    const db = withDb();
    const { result } = renderHook(() => useCelebrations(db, [done('a', 1), done('b', 2)], true));

    await waitFor(async () => expect(await seenOf(db)).toEqual(['a', 'b']));
    expect(result.current.size).toBe(0);
  });

  it('records an empty list for someone with nothing finished yet, so their first one plays', async () => {
    const db = withDb();
    const { rerender, result } = renderHook(
      ({ finished }: { finished: FinishedConstellation[] }) => useCelebrations(db, finished, true),
      { initialProps: { finished: [] as FinishedConstellation[] } },
    );
    await waitFor(async () => expect(await seenOf(db)).toEqual([]));

    rerender({ finished: [done('first', 10)] });
    await waitFor(() => expect(result.current.get('first')).toBe(0));
  });

  it('plays one finished since, records it at once, and keeps playing after the record is written', async () => {
    const db = withDb();
    await writeMeta(db, META_KEYS.celebratedConstellations, ['old']);
    const { result } = renderHook(() =>
      useCelebrations(db, [done('old', 1), done('new', 2)], true),
    );

    await waitFor(() => expect(result.current.has('new')).toBe(true));
    await waitFor(async () => expect(await seenOf(db)).toEqual(['old', 'new']));
    await settle();
    // The record came back through the live query; the moment is still on.
    expect(result.current.has('new')).toBe(true);
    expect(result.current.has('old')).toBe(false);
  });

  it('never plays the same one again, not after a re-render and not after the sky reopens', async () => {
    const db = withDb();
    await writeMeta(db, META_KEYS.celebratedConstellations, []);
    const finished = [done('kite', 5)];
    const first = renderHook(() => useCelebrations(db, finished, true));
    await waitFor(() => expect(first.result.current.has('kite')).toBe(true));
    await waitFor(async () => expect(await seenOf(db)).toEqual(['kite']));
    first.unmount();

    const again = renderHook(() => useCelebrations(db, finished, true));
    await settle();
    expect(again.result.current.size).toBe(0);
    expect(await seenOf(db)).toEqual(['kite']);
  });

  it('behind the timer, plays just the one an arriving star finished, after the light lands (PR 5)', async () => {
    const db = withDb();
    await writeMeta(db, META_KEYS.celebratedConstellations, ['old']);
    const finished = [done('old', 1), done('waiting', 2), done('kite', 3)];
    const hero = renderHook(() => useCelebrations(db, finished, { only: 'kite' }));
    await waitFor(() => expect(hero.result.current.get('kite')).toBe(HERO_CELEBRATION_DELAY_MS));
    // Recorded at once; the other unseen one still waits for the full sky.
    await waitFor(async () => expect(await seenOf(db)).toEqual(['old', 'kite']));
    expect(hero.result.current.has('waiting')).toBe(false);
    hero.unmount();

    const full = renderHook(() => useCelebrations(db, finished, true));
    await waitFor(() => expect(full.result.current.has('waiting')).toBe(true));
    expect(full.result.current.has('kite')).toBe(false);
  });

  it('stops a moment when the view changes, so the other view never replays it (PR 5, case 3)', async () => {
    const db = withDb();
    await writeMeta(db, META_KEYS.celebratedConstellations, []);
    const finished = [done('kite', 3)];
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean | { only: string } }) =>
        useCelebrations(db, finished, enabled),
      { initialProps: { enabled: true as boolean | { only: string } } },
    );
    await waitFor(() => expect(result.current.has('kite')).toBe(true));

    // Back behind the result, where its star has just arrived: not again.
    rerender({ enabled: { only: 'kite' } });
    await settle();
    expect(result.current.size).toBe(0);
  });

  it('behind the timer, plays nothing for one already seen, and keeps the first-run rule', async () => {
    const db = withDb();
    const first = renderHook(() => useCelebrations(db, [done('kite', 3)], { only: 'kite' }));
    // No record yet: this is the first run, so everything finished is recorded unplayed.
    await waitFor(async () => expect(await seenOf(db)).toEqual(['kite']));
    await settle();
    expect(first.result.current.size).toBe(0);
  });

  it('plays at most three, a beat apart, newest first, and records the rest', async () => {
    const db = withDb();
    await writeMeta(db, META_KEYS.celebratedConstellations, []);
    const many = [1, 2, 3, 4, 5].map((t) => done(`c${t}`, t));
    const { result } = renderHook(() => useCelebrations(db, many, true));

    await waitFor(() => expect(result.current.size).toBe(3));
    expect([...result.current.entries()]).toEqual([
      ['c5', 0],
      ['c4', CELEBRATION_STAGGER_MS],
      ['c3', 2 * CELEBRATION_STAGGER_MS],
    ]);
    await waitFor(async () =>
      expect([...((await seenOf(db)) ?? [])].sort()).toEqual(['c1', 'c2', 'c3', 'c4', 'c5']),
    );
  });

  it('makes the first record behind the timer, so one finished before the sky is first opened still plays', async () => {
    const db = withDb();
    const { result, rerender } = renderHook(
      ({ finished, on }: { finished: FinishedConstellation[]; on: boolean }) =>
        useCelebrations(db, finished, on),
      { initialProps: { finished: [] as FinishedConstellation[], on: false } },
    );
    // A new person, timer showing: an empty record is made.
    await waitFor(async () => expect(await seenOf(db)).toEqual([]));

    // They finish the Kite without opening the sky: nothing plays, nothing more is recorded.
    rerender({ finished: [done('kite', 9)], on: false });
    await settle();
    expect(result.current.size).toBe(0);
    expect(await seenOf(db)).toEqual([]);

    // They open the sky: the Kite gets its moment.
    rerender({ finished: [done('kite', 9)], on: true });
    await waitFor(() => expect(result.current.has('kite')).toBe(true));
    await waitFor(async () => expect(await seenOf(db)).toEqual(['kite']));
  });

  it('does nothing while off once the first record exists: no moment, no record', async () => {
    const db = withDb();
    await writeMeta(db, META_KEYS.celebratedConstellations, []);
    const { result } = renderHook(() => useCelebrations(db, [done('a', 1)], false));
    await settle();
    expect(result.current.size).toBe(0);
    expect(await seenOf(db)).toEqual([]);
  });

  it('stops a moment when switched off part-way, and does not bring it back when switched on', async () => {
    const db = withDb();
    await writeMeta(db, META_KEYS.celebratedConstellations, []);
    const { result, rerender } = renderHook(
      ({ on }: { on: boolean }) => useCelebrations(db, [done('a', 1)], on),
      { initialProps: { on: true } },
    );
    await waitFor(() => expect(result.current.has('a')).toBe(true));

    rerender({ on: false });
    await waitFor(() => expect(result.current.size).toBe(0));
    rerender({ on: true });
    await settle();
    expect(result.current.size).toBe(0);
  });
});
