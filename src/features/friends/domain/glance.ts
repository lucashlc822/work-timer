import type { FriendRow } from '../data/friendsRepository';
import { friendStatus, type FriendStatus, type Presence } from './presence';
import type { FocusStatus } from './focusStatus';

export interface GlanceFriend {
  id: string;
  name: string;
  status: Exclude<FriendStatus, 'offline'>;
}

export interface FriendsGlanceModel {
  /** Who is around, focusing first, at most `max`. */
  shown: GlanceFriend[];
  /** How many more are around than are shown. */
  more: number;
  /** Accepted friends in total. */
  total: number;
}

const ORDER: Record<GlanceFriend['status'], number> = { focusing: 0, break: 1, online: 2, away: 3 };

/**
 * Which friends the home page names (premium motion PR 5): those who are
 * around right now (focusing, on a break, online or away), focusing first,
 * then by name. Offline friends aren't named; the glance is about company, not
 * a roll call. `max` are shown and the rest counted.
 */
export const friendsGlance = (
  friends: readonly FriendRow[],
  focus: ReadonlyMap<string, FocusStatus>,
  presence: ReadonlyMap<string, Presence>,
  now: number,
  max = 3,
): FriendsGlanceModel => {
  const around = friends
    .flatMap((f): GlanceFriend[] => {
      const status = friendStatus(
        focus.get(f.friendId) ?? null,
        presence.get(f.friendId) ?? null,
        now,
      );
      return status === 'offline'
        ? []
        : [{ id: f.friendId, name: f.displayName ?? 'A friend', status }];
    })
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.name.localeCompare(b.name));
  return {
    shown: around.slice(0, max),
    more: Math.max(0, around.length - max),
    total: friends.length,
  };
};

/** "is focusing", "is on a break", "is online", "is away". */
export const STATUS_PHRASE: Record<GlanceFriend['status'], string> = {
  focusing: 'is focusing',
  break: 'is on a break',
  online: 'is online',
  away: 'is away',
};
