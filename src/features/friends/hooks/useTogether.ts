import { REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getSupabase } from '@/shared/backend';
import { APP_NAME } from '@/shared/config';
import { getRuntime } from '@/shared/runtime';

import {
  cancelRoom,
  createRoom,
  FriendsFailure,
  leaveRoom,
  myRooms,
  respondRoom,
  startRoom,
} from '../data/friendsRepository';
import { currentRoom, nameOf, pendingInvite, type Room } from '../domain/room';

/** How often an open room is re-read when its live channel might be down. */
export const ROOM_POLL_MS = 15_000;
/** How long to wait after a live event before re-reading (several often arrive at once). */
const LIVE_DEBOUNCE_MS = 300;

export interface Together {
  /** Every room you're in from the last day, newest first; empty until loaded. */
  rooms: readonly Room[];
  /** The room you're in now (lobby or running), if any. */
  room: Room | null;
  /** The newest invitation waiting for your answer, if any. */
  invite: Room | null;
  refresh: () => Promise<void>;
  create: (friendIds: readonly string[], plannedDurationS: number) => Promise<void>;
  respond: (roomId: string, join: boolean) => Promise<void>;
  start: (roomId: string) => Promise<void>;
  leave: (roomId: string) => Promise<void>;
  /**
   * End a running room for everyone. Never rejects: if the server can't be
   * reached it is retried when the connection returns, the window comes back,
   * or the next read — friends learn of it as soon as it lands.
   */
  cancel: (roomId: string) => void;
}

const client = () => {
  const c = getSupabase();
  if (c === null) throw new FriendsFailure('offline');
  return c;
};

/**
 * Focus-together rooms (M7 phase 4), in memory only.
 *
 * Live: the server touches every member's `together_members` row on any
 * change to a room, and this listens to the person's own rows — so an
 * invitation, a join, the start and a cancel each arrive within a second or
 * two. Re-read also on start, when the window comes back, when the
 * connection returns, and every 15 s while a room or invitation is open, in
 * case the live channel is down.
 *
 * A new invitation raises a notification (on the desktop, a Windows one).
 * Actions reject with `FriendsFailure`, except `cancel`, which retries.
 */
export const useTogether = (userId: string): Together => {
  const [rooms, setRooms] = useState<readonly Room[]>([]);
  const alive = useRef(true);
  const pendingCancels = useRef(new Set<string>());
  const seenInvites = useRef<Set<string> | null>(null);

  const flushCancels = useCallback(async () => {
    for (const roomId of [...pendingCancels.current]) {
      try {
        await cancelRoom(client(), roomId);
        pendingCancels.current.delete(roomId);
      } catch (e) {
        // Gone or already over: nothing left to cancel. Otherwise, try again later.
        if (e instanceof FriendsFailure && e.kind !== 'offline' && e.kind !== 'unknown') {
          pendingCancels.current.delete(roomId);
        }
      }
    }
  }, []);

  const refresh = useCallback(async () => {
    await flushCancels();
    try {
      const next = await myRooms(client());
      if (alive.current) setRooms(next);
    } catch {
      // Offline: keep what is on screen; the next trigger reads again.
    }
  }, [flushCancels]);

  // A new invitation, noticed once per app run, raises a notification. The
  // first read only records what is already waiting: the banner shows those.
  const invite = pendingInvite(rooms, userId);
  useEffect(() => {
    if (invite === null) return;
    if (seenInvites.current === null) {
      seenInvites.current = new Set([invite.id]);
      return;
    }
    if (seenInvites.current.has(invite.id)) return;
    seenInvites.current.add(invite.id);
    const minutes = Math.round(invite.plannedDurationS / 60);
    void getRuntime().then((host) =>
      host.notifications.notify({
        title: APP_NAME,
        body: `${nameOf(invite, invite.host)} invites you to focus ${minutes} min together.`,
      }),
    );
  }, [invite]);

  // Read on start, and mark "nothing waiting yet" once the first read lands.
  useEffect(() => {
    alive.current = true;
    void refresh().then(() => {
      seenInvites.current ??= new Set();
    });
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

  // Live: changes to this person's own memberships. A re-subscribe counts as
  // a change, since events sent while disconnected are lost.
  useEffect(() => {
    const c = getSupabase();
    if (c === null) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), LIVE_DEBOUNCE_MS);
    };
    let subscribedBefore = false;
    const channel = c
      .channel(`together:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'together_members',
          filter: `user_id=eq.${userId}`,
        },
        soon,
      )
      .subscribe((status) => {
        if (status !== REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) return;
        if (subscribedBefore) soon();
        subscribedBefore = true;
      });
    return () => {
      clearTimeout(timer);
      void c.removeChannel(channel);
    };
  }, [userId, refresh]);

  // The fallback: while anything is open, read every 15 s.
  const now = Date.now();
  const room = currentRoom(rooms, userId, now);
  const open = room !== null || invite !== null || pendingCancels.current.size > 0;
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => void refresh(), ROOM_POLL_MS);
    return () => clearInterval(timer);
  }, [open, refresh]);

  const thenRefresh = useCallback(
    async (action: () => Promise<unknown>) => {
      try {
        await action();
      } finally {
        await refresh();
      }
    },
    [refresh],
  );

  const create = useCallback(
    (friendIds: readonly string[], plannedDurationS: number) =>
      thenRefresh(() => createRoom(client(), friendIds, plannedDurationS)),
    [thenRefresh],
  );
  const respond = useCallback(
    (roomId: string, join: boolean) => thenRefresh(() => respondRoom(client(), roomId, join)),
    [thenRefresh],
  );
  const start = useCallback(
    (roomId: string) => thenRefresh(() => startRoom(client(), roomId)),
    [thenRefresh],
  );
  const leave = useCallback(
    (roomId: string) => thenRefresh(() => leaveRoom(client(), roomId)),
    [thenRefresh],
  );
  const cancel = useCallback(
    (roomId: string) => {
      pendingCancels.current.add(roomId);
      void refresh();
    },
    [refresh],
  );

  return useMemo(
    () => ({ rooms, room, invite, refresh, create, respond, start, leave, cancel }),
    [rooms, room, invite, refresh, create, respond, start, leave, cancel],
  );
};
