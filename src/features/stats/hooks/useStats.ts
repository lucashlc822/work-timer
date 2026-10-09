import { useLiveQuery } from 'dexie-react-hooks';

import { db, type SessionRow, type TagRow } from '@/shared/db';

import { readEarliestStart, readSessionsFor, readTagsById } from '../data/statsRepository';
import type { Period } from '../domain/period';

export const useEarliestStart = (): number | null | undefined =>
  useLiveQuery(() => readEarliestStart(db), []);

export interface StatsData {
  sessions: SessionRow[];
  tags: Map<string, TagRow>;
}

/**
 * The sessions and tags behind one period, live — a session finishing while
 * the stats are open shows up without a refresh. `undefined` until the first
 * read completes.
 */
export const useStats = (period: Period): StatsData | undefined =>
  useLiveQuery(
    async () => ({ sessions: await readSessionsFor(db, period), tags: await readTagsById(db) }),
    [period.kind, period.start, period.end],
  );
