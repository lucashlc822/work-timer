import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getSupabase } from '@/shared/backend';

import {
  FriendsFailure,
  friendsFocus,
  getMyProfile,
  listFriends,
  removeFriend,
  requestFriend,
  respondFriend,
  setDisplayName,
  type FriendRow,
  type MyProfile,
} from '../data/friendsRepository';
import type { FocusStatus } from '../domain/focusStatus';

/** How often an open Friends panel re-checks who is focusing. */
export const FOCUS_POLL_MS = 15_000;

export type FriendsLoad = 'loading' | 'ready' | 'offline' | 'error';

export interface Friends {
  load: FriendsLoad;
  profile: MyProfile | null;
  /** Accepted friends, by name. */
  friends: FriendRow[];
  incoming: FriendRow[];
  outgoing: FriendRow[];
  /** Friends focusing or on a break right now, by friend id (M7 phase 3). */
  focus: ReadonlyMap<string, FocusStatus>;
  refresh: () => Promise<void>;
  saveName: (name: string) => Promise<void>;
  /** The friend's name, and whether you're friends already (they had asked you). */
  sendRequest: (code: string) => Promise<{ outcome: 'pending' | 'accepted'; name: string | null }>;
  respond: (requestId: string, accept: boolean) => Promise<void>;
  remove: (friendshipId: string) => Promise<void>;
}

const byName = (a: FriendRow, b: FriendRow): number =>
  (a.displayName ?? '').localeCompare(b.displayName ?? '');

const client = () => {
  const c = getSupabase();
  if (c === null) throw new FriendsFailure('offline');
  return c;
};

/**
 * Your profile, friends and requests (M7), in memory only — never in this
 * device's store, since most of it is other people's.
 *
 * Read when the app starts and whenever the window comes back into view, so a
 * request someone sent you shows on the Friends pill without any live
 * connection. Every action re-reads afterwards. Actions reject with
 * `FriendsFailure`, for the screen to explain.
 *
 * While `watching` (a Friends screen is open) it also re-reads every
 * `FOCUS_POLL_MS`, so "Focusing now" appears within about 15 seconds.
 */
export const useFriends = ({ watching = false }: { watching?: boolean } = {}): Friends => {
  const [load, setLoad] = useState<FriendsLoad>('loading');
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [rows, setRows] = useState<FriendRow[]>([]);
  const [focus, setFocus] = useState<ReadonlyMap<string, FocusStatus>>(new Map());
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const c = client();
      const [p, list, focusing] = await Promise.all([
        getMyProfile(c),
        listFriends(c),
        // Who is focusing is extra: if only that fails, the list still shows.
        friendsFocus(c).catch(() => new Map<string, FocusStatus>()),
      ]);
      if (!alive.current) return;
      setProfile(p);
      setRows(list);
      setFocus(focusing);
      setLoad('ready');
    } catch (e) {
      if (!alive.current) return;
      setLoad(e instanceof FriendsFailure && e.kind === 'offline' ? 'offline' : 'error');
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
    if (!watching) return;
    const timer = window.setInterval(() => void refresh(), FOCUS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [watching, refresh]);

  // Re-read after an action whether it worked or not: a "not found" means the
  // list on screen was already out of date.
  const thenRefresh = useCallback(
    async <T>(action: () => Promise<T>): Promise<T> => {
      try {
        return await action();
      } finally {
        await refresh();
      }
    },
    [refresh],
  );

  const saveName = useCallback(
    (name: string) => thenRefresh(() => setDisplayName(client(), name)),
    [thenRefresh],
  );

  const sendRequest = useCallback(
    (code: string) =>
      thenRefresh(async () => {
        const c = client();
        const before = await listFriends(c);
        const outcome = await requestFriend(c, code);
        // The server doesn't say whose code it was: it's the row that is new,
        // or that just turned into a friendship.
        const seen = new Set(before.map((r) => `${r.friendshipId}:${r.status}`));
        const changed = (await listFriends(c)).find(
          (r) => !seen.has(`${r.friendshipId}:${r.status}`),
        );
        return { outcome, name: changed?.displayName ?? null };
      }),
    [thenRefresh],
  );

  const respond = useCallback(
    (requestId: string, accept: boolean) =>
      thenRefresh(() => respondFriend(client(), requestId, accept)),
    [thenRefresh],
  );

  const remove = useCallback(
    (friendshipId: string) => thenRefresh(() => removeFriend(client(), friendshipId)),
    [thenRefresh],
  );

  return useMemo(
    () => ({
      load,
      profile,
      friends: rows.filter((r) => r.status === 'accepted').sort(byName),
      incoming: rows.filter((r) => r.direction === 'incoming'),
      outgoing: rows.filter((r) => r.direction === 'outgoing'),
      focus,
      refresh,
      saveName,
      sendRequest,
      respond,
      remove,
    }),
    [load, profile, rows, focus, refresh, saveName, sendRequest, respond, remove],
  );
};
