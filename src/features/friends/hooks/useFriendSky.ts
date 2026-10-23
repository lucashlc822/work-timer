import { useCallback, useEffect, useState } from 'react';

import { getSupabase } from '@/shared/backend';

import { FriendsFailure, getFriendSky } from '../data/friendsRepository';
import type { FriendsErrorKind } from '../domain/errors';
import type { FriendSky } from '../domain/friendSky';

export type FriendSkyState =
  | { kind: 'loading' }
  | { kind: 'ready'; sky: FriendSky }
  | { kind: 'failed'; reason: FriendsErrorKind };

/** A friend's sky, fetched when opened and kept in memory only. */
export const useFriendSky = (friendId: string): { state: FriendSkyState; retry: () => void } => {
  const [state, setState] = useState<FriendSkyState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setState({ kind: 'loading' });
    const client = getSupabase();
    const fetching =
      client === null
        ? Promise.reject(new FriendsFailure('offline'))
        : getFriendSky(client, friendId);
    fetching.then(
      (sky) => alive && setState({ kind: 'ready', sky }),
      (e: unknown) =>
        alive &&
        setState({ kind: 'failed', reason: e instanceof FriendsFailure ? e.kind : 'unknown' }),
    );
    return () => {
      alive = false;
    };
  }, [friendId, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, retry };
};
