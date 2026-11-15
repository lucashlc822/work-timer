import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';

import { db } from '@/shared/db';

import { sessionRewards, type FinishedConstellation, type Rewards } from '../domain/rewards';
import { useDailyGoal } from './useStardust';

const NO_FINISHED: readonly FinishedConstellation[] = [];

/**
 * What the given sessions earned, live (`domain/rewards.ts`). Each read is one
 * flat Dexie call, so the live queries keep updating (CLAUDE.md, Dexie). The
 * clock is read once, when the result mounts: it decides which days the goal
 * bonus looks at, as it did for the reconciler a moment ago.
 *
 * `undefined` until sessions, ledger and goal have all been read.
 */
export const useSessionRewards = (
  userId: string,
  sessionIds: readonly string[],
  finished: readonly FinishedConstellation[] = NO_FINISHED,
): Rewards | undefined => {
  const sessions = useLiveQuery(() => db.sessions.toArray(), []);
  const ledger = useLiveQuery(() => db.ledger.toArray(), []);
  const goalMin = useDailyGoal();
  const [now] = useState(() => Date.now());
  const key = sessionIds.join('|');

  return useMemo(() => {
    if (sessions === undefined || ledger === undefined || goalMin === undefined) return undefined;
    return sessionRewards({
      userId,
      sessions,
      sessionIds: new Set(key.split('|')),
      goalMin,
      now,
      finished,
      ledger: new Map(ledger.map((row) => [row.id, row.createdAt])),
    });
  }, [sessions, ledger, goalMin, now, userId, key, finished]);
};
