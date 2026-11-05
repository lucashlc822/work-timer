import { useEffect } from 'react';

import type { Room } from '@/features/friends';
import { db, META_KEYS, readMeta, writeMeta, type TogetherNamesMeta } from '@/shared/db';

/**
 * Who you focused with, remembered on this device (View sky upgrade PR 3).
 *
 * The friends feature holds rooms in memory only, and the server lists only the
 * last day's; a star from a focus-together session should still say "Focused
 * with mia" months later. So `app/` — where the friends and sky features meet —
 * copies the names out of every room you were in once it has started, into
 * `META_KEYS.togetherNames`, which the sky reads. Never synced: another device
 * that wasn't in the room says "Focused together".
 */

/** How many rooms to remember; the oldest go first. Years of daily sessions. */
export const TOGETHER_NAMES_CAP = 500;

/** Rooms that actually ran, or began to: a lobby that never started made no star. */
const STARTED: ReadonlySet<Room['status']> = new Set(['running', 'done', 'cancelled']);

/**
 * The remembered names with any newly started rooms added, or null when there
 * is nothing new to write (so the caller doesn't rewrite the same value on
 * every refresh). Names are the other members who were in it; one without a
 * display name is left out, and an empty list reads "Focused together".
 */
export const mergeTogetherNames = (
  rooms: readonly Room[],
  me: string,
  known: TogetherNamesMeta | undefined,
  cap = TOGETHER_NAMES_CAP,
): TogetherNamesMeta | null => {
  const next: TogetherNamesMeta = { ...known };
  let changed = false;
  for (const room of rooms) {
    if (!STARTED.has(room.status) || room.startsAt === null) continue;
    const mine = room.members.find((m) => m.userId === me);
    if (mine?.state !== 'joined') continue;
    const names = room.members
      .filter((m) => m.userId !== me && m.state === 'joined' && m.displayName !== null)
      .map((m) => m.displayName as string);
    const before = next[room.id];
    if (
      before !== undefined &&
      before.startsAt === room.startsAt &&
      before.names.length === names.length &&
      before.names.every((n, i) => n === names[i])
    ) {
      continue;
    }
    next[room.id] = { names, startsAt: room.startsAt };
    changed = true;
  }
  if (!changed) return null;

  const ids = Object.keys(next);
  if (ids.length > cap) {
    const newest = ids
      .sort(
        (a, b) =>
          (next[b] as { startsAt: number }).startsAt - (next[a] as { startsAt: number }).startsAt,
      )
      .slice(0, cap);
    return Object.fromEntries(newest.map((id) => [id, next[id] as TogetherNamesMeta[string]]));
  }
  return next;
};

/** Keep `META_KEYS.togetherNames` up to date with the rooms the app has seen. */
export const useRememberTogetherNames = (rooms: readonly Room[], me: string): void => {
  useEffect(() => {
    if (rooms.length === 0) return;
    let cancelled = false;
    void (async () => {
      const known = await readMeta<TogetherNamesMeta>(db, META_KEYS.togetherNames);
      const next = mergeTogetherNames(rooms, me, known);
      if (!cancelled && next !== null) await writeMeta(db, META_KEYS.togetherNames, next);
    })();
    return () => {
      cancelled = true;
    };
  }, [rooms, me]);
};
