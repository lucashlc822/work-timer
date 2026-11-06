// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { createDb, META_KEYS, readMeta, writeMeta, type WorkTimerDb } from '@/shared/db';

import type { FinishedConstellation } from '../domain/celebrate';
import { CELEBRATION_STAGGER_MS, useCelebrations } from './useCelebrations';

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
