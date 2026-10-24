import { useCallback, useEffect, useState } from 'react';

import { getSupabase } from '@/shared/backend';

import { togetherWins } from '../data/friendsRepository';

/** How often to ask again: a win appears when the last member's session syncs. */
const WINS_POLL_MS = 2 * 60_000;

export interface TogetherWinRow {
  roomId: string;
  /** Epoch ms: the room's shared end. */
  endsAt: number;
}

const NONE: readonly TogetherWinRow[] = [];

/**
 * Rooms everyone completed (M7 phase 4), for the Stardust reconciler's +10.
 *
 * Only the server can see every member's session, so this asks it: on start,
 * when the window comes back, when the connection returns, and every two
 * minutes (the last member's session may sync from another device at any
 * time). Empty until the first answer, and kept as it was when offline —
 * harmless either way, since the reconciler only ever adds missing rows.
 */
export const useTogetherWins = (): readonly TogetherWinRow[] => {
  const [wins, setWins] = useState<readonly TogetherWinRow[]>(NONE);

  const read = useCallback(async () => {
    const client = getSupabase();
    if (client === null) return;
    try {
      const next = await togetherWins(client);
      // Keep the same array while nothing changed, so the reconciler doesn't re-run.
      setWins((prev) =>
        prev.length === next.length && next.every((w, i) => w.roomId === prev[i]?.roomId)
          ? prev
          : next,
      );
    } catch {
      // Offline: try again on the next trigger.
    }
  }, []);

  useEffect(() => {
    void read();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void read();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    const timer = setInterval(() => void read(), WINS_POLL_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
      clearInterval(timer);
    };
  }, [read]);

  return wins;
};
