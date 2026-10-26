import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getSupabase } from '@/shared/backend';

import {
  FriendsFailure,
  myShared,
  proposeShared,
  respondShared,
  stopShared,
} from '../data/friendsRepository';
import type { SharedDraft, SharedRow } from '../domain/shared';

/** How often to look again: a friend's new star arrives when their session syncs. */
const SHARED_POLL_MS = 2 * 60_000;

export interface Shared {
  /** Null until the first answer; kept as it was while offline. */
  rows: readonly SharedRow[] | null;
  refresh: () => Promise<void>;
  propose: (friendId: string, draft: SharedDraft) => Promise<void>;
  respond: (sharedId: string, accept: boolean) => Promise<void>;
  stop: (sharedId: string) => Promise<void>;
}

const client = () => {
  const c = getSupabase();
  if (c === null) throw new FriendsFailure('offline');
  return c;
};

/**
 * Your shared constellations (M7 phase 5), in memory only like the rest of
 * friends' data: their stars are partly someone else's sessions.
 *
 * Read on start, when the window comes back, when the connection returns,
 * every two minutes, and after every action; `refresh` lets a screen ask more
 * often (an open Friends screen does, every 15 s). The array keeps its
 * identity while nothing changed, so the sky and the Stardust reconciler
 * don't redo their work on every poll.
 */
export const useShared = (): Shared => {
  const [rows, setRows] = useState<readonly SharedRow[] | null>(null);
  const last = useRef<string | null>(null);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const next = await myShared(client());
      const key = JSON.stringify(next);
      if (!alive.current || key === last.current) return;
      last.current = key;
      setRows(next);
    } catch {
      // Offline or the server is away: keep what is shown, try on the next trigger.
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      alive.current = false;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => void refresh(), SHARED_POLL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  // Re-read after an action whether it worked or not, as the friend list does.
  const then = useCallback(
    async (action: () => Promise<unknown>): Promise<void> => {
      try {
        await action();
      } finally {
        await refresh();
      }
    },
    [refresh],
  );

  const propose = useCallback(
    (friendId: string, draft: SharedDraft) => then(() => proposeShared(client(), friendId, draft)),
    [then],
  );
  const respond = useCallback(
    (sharedId: string, accept: boolean) => then(() => respondShared(client(), sharedId, accept)),
    [then],
  );
  const stop = useCallback(
    (sharedId: string) => then(() => stopShared(client(), sharedId)),
    [then],
  );

  return useMemo(
    () => ({ rows, refresh, propose, respond, stop }),
    [rows, refresh, propose, respond, stop],
  );
};
