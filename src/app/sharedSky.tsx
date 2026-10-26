import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, type ReactNode } from 'react';

import { useShared, type DescribeShared } from '@/features/friends';
import type { SharedCompletion } from '@/features/progression';
import { deriveShared, type SharedState } from '@/features/sky';
import { db, type SessionRow } from '@/shared/db';

import { fromDevice, sharedCompletions, toSharedInput } from './sharedInputs';
import { SharedSkyContext } from './sharedSkyContext';

const NONE_STATES: readonly SharedState[] = [];
const NONE_DONE: readonly SharedCompletion[] = [];

/** This device's sessions run for any shared constellation. Flat, safe in a live query. */
const readOwnShared = (): Promise<SessionRow[]> =>
  db.sessions.filter((s) => s.sharedId !== undefined).toArray();

/**
 * Fetches the account's shared constellations once for the whole signed-in
 * app, and derives what the sky draws and what the reconciler pays
 * (`sharedInputs.ts` says why those are two different derivations).
 */
export const SharedSkyProvider = ({ children }: { children: ReactNode }) => {
  const shared = useShared();
  const ownRows = useLiveQuery(readOwnShared, []);
  const { rows, refresh } = shared;

  // Once one of your own sessions for it has uploaded, the server can count it:
  // ask again, so the bonus doesn't wait for the next poll.
  const synced = (ownRows ?? []).filter((s) => s.syncedAt !== null).length;
  useEffect(() => {
    if (synced > 0) void refresh();
  }, [synced, refresh]);

  const own = useMemo(() => (ownRows ?? []).flatMap((s) => fromDevice(s) ?? []), [ownRows]);
  const states = useMemo(
    () => (rows === null ? NONE_STATES : rows.map((r) => deriveShared(toSharedInput(r, own)))),
    [rows, own],
  );
  const completions = useMemo(() => (rows === null ? NONE_DONE : sharedCompletions(rows)), [rows]);
  const describe = useMemo<DescribeShared>(() => {
    const byId = new Map(states.map((s) => [s.choice.id, s]));
    return (row) => {
      const state = byId.get(row.id) ?? deriveShared(toSharedInput(row, own));
      return {
        name: state.def.name,
        stars: state.stars.length,
        total: state.starsNeeded,
        done: state.complete,
      };
    };
  }, [states, own]);

  const value = useMemo(
    () => ({ shared, states, completions, describe }),
    [shared, states, completions, describe],
  );
  return <SharedSkyContext.Provider value={value}>{children}</SharedSkyContext.Provider>;
};
