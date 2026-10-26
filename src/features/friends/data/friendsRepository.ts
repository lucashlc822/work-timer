import type { SupabaseClient } from '@supabase/supabase-js';

import { classifyFriendsError, type FriendsErrorKind } from '../domain/errors';
import type { FocusStatus } from '../domain/focusStatus';
import { decodeFriendSky, type FriendSky } from '../domain/friendSky';
import { decodeRooms, type Room } from '../domain/room';
import { decodeShared, type SharedDraft, type SharedRow } from '../domain/shared';

/**
 * Every friends action, over the server's friends functions (M7).
 *
 * Nothing here touches this device's store: friends' data is someone else's,
 * so it is fetched when shown and kept in memory only. Each function resolves
 * on success and rejects with `FriendsFailure`, so screens only ever deal with
 * the named kinds in `domain/errors`.
 */

export class FriendsFailure extends Error {
  readonly kind: FriendsErrorKind;

  constructor(kind: FriendsErrorKind, cause?: unknown) {
    super(`Friends action failed: ${kind}`, { cause });
    this.kind = kind;
    this.name = 'FriendsFailure';
  }
}

export interface MyProfile {
  displayName: string | null;
  /** Bare, as stored: "K7Q2MX". */
  friendCode: string;
}

export interface FriendRow {
  friendshipId: string;
  friendId: string;
  displayName: string | null;
  status: 'accepted' | 'pending';
  /** Pending requests only: who asked. */
  direction: 'incoming' | 'outgoing' | null;
  since: number;
  /** Accepted friends only: when they last completed a session. */
  lastFocusAt: number | null;
}

interface Answer<T> {
  data: T | null;
  error: { message?: string; code?: string } | null;
  status?: number;
}

/** A query builder is only thenable; `run` makes it a real Promise. Network errors can throw. */
const call = async <T>(run: () => PromiseLike<Answer<T>>): Promise<T | null> => {
  let answer: Answer<T>;
  try {
    answer = await run();
  } catch (e) {
    throw new FriendsFailure(classifyFriendsError({ message: String(e), status: 0 }), e);
  }
  if (answer.error !== null) {
    throw new FriendsFailure(
      classifyFriendsError({ ...answer.error, status: answer.status }),
      answer.error,
    );
  }
  return answer.data;
};

const ms = (iso: unknown): number | null => {
  if (typeof iso !== 'string') return null;
  const at = Date.parse(iso);
  return Number.isFinite(at) ? at : null;
};

export const getMyProfile = async (client: SupabaseClient): Promise<MyProfile> => {
  const row = await call<{ display_name: string | null; friend_code: string }>(() =>
    client.from('profiles').select('display_name, friend_code').maybeSingle(),
  );
  if (row === null) throw new FriendsFailure('unknown');
  return { displayName: row.display_name, friendCode: row.friend_code };
};

export const setDisplayName = async (client: SupabaseClient, name: string): Promise<void> => {
  await call(() => client.rpc('set_display_name', { name }));
};

/** `accepted` when they had already asked you: you're friends now. */
export const requestFriend = async (
  client: SupabaseClient,
  code: string,
): Promise<'pending' | 'accepted'> => {
  const result = await call<string>(() => client.rpc('request_friend', { code }));
  return result === 'accepted' ? 'accepted' : 'pending';
};

export const respondFriend = async (
  client: SupabaseClient,
  requestId: string,
  accept: boolean,
): Promise<void> => {
  await call(() => client.rpc('respond_friend', { request_id: requestId, accept }));
};

/** Ends a friendship, or withdraws or declines a request. */
export const removeFriend = async (client: SupabaseClient, friendshipId: string): Promise<void> => {
  await call(() => client.rpc('remove_friend', { friendship_id: friendshipId }));
};

export const listFriends = async (client: SupabaseClient): Promise<FriendRow[]> => {
  const rows = await call<Record<string, unknown>[]>(() => client.rpc('my_friends'));
  return (rows ?? []).flatMap((r): FriendRow[] => {
    const since = ms(r.since);
    if (typeof r.friendship_id !== 'string' || typeof r.friend_id !== 'string' || since === null) {
      return [];
    }
    return [
      {
        friendshipId: r.friendship_id,
        friendId: r.friend_id,
        displayName: typeof r.display_name === 'string' ? r.display_name : null,
        status: r.status === 'accepted' ? 'accepted' : 'pending',
        direction: r.direction === 'incoming' || r.direction === 'outgoing' ? r.direction : null,
        since,
        lastFocusAt: ms(r.last_focus_at),
      },
    ];
  });
};

export const getFriendSky = async (
  client: SupabaseClient,
  friendId: string,
): Promise<FriendSky> => {
  const payload = await call<unknown>(() => client.rpc('friend_sky', { friend: friendId }));
  const sky = decodeFriendSky(payload);
  if (sky === null) throw new FriendsFailure('unknown');
  return sky;
};

/** Tells friends what you're doing now (M7 phase 3). */
export const setFocusStatus = async (
  client: SupabaseClient,
  status: FocusStatus,
): Promise<void> => {
  await call(() =>
    client.rpc('set_focus_status', {
      kind: status.kind,
      started_at: new Date(status.startedAt).toISOString(),
      until: new Date(status.until).toISOString(),
    }),
  );
};

export const clearFocusStatus = async (client: SupabaseClient): Promise<void> => {
  await call(() => client.rpc('clear_focus_status'));
};

/** Your friends who are focusing or on a break right now, by friend id. */
export const friendsFocus = async (client: SupabaseClient): Promise<Map<string, FocusStatus>> => {
  const rows = await call<Record<string, unknown>[]>(() => client.rpc('friends_focus'));
  const byFriend = new Map<string, FocusStatus>();
  for (const r of rows ?? []) {
    const startedAt = ms(r.started_at);
    const until = ms(r.until);
    if (
      typeof r.friend_id !== 'string' ||
      (r.kind !== 'focus' && r.kind !== 'break') ||
      startedAt === null ||
      until === null
    ) {
      continue;
    }
    byFriend.set(r.friend_id, { kind: r.kind, startedAt, until });
  }
  return byFriend;
};

// --- Focus together (M7 phase 4) ----------------------------------------------

/** Opens a room with 1–3 friends; you are the host, already in. Returns its id. */
export const createRoom = async (
  client: SupabaseClient,
  friendIds: readonly string[],
  plannedDurationS: number,
): Promise<string> => {
  const id = await call<string>(() =>
    client.rpc('create_room', { friends: friendIds, planned_duration_s: plannedDurationS }),
  );
  if (typeof id !== 'string') throw new FriendsFailure('unknown');
  return id;
};

export const respondRoom = async (
  client: SupabaseClient,
  roomId: string,
  join: boolean,
): Promise<void> => {
  await call(() => client.rpc('respond_room', { room: roomId, join_room: join }));
};

export const startRoom = async (client: SupabaseClient, roomId: string): Promise<void> => {
  await call(() => client.rpc('start_room', { room: roomId }));
};

/** Before the start: leave an invitation, or (as host) give the room up. */
export const leaveRoom = async (client: SupabaseClient, roomId: string): Promise<void> => {
  await call(() => client.rpc('leave_room', { room: roomId }));
};

/** While it runs: end it for everyone. Safe to retry. */
export const cancelRoom = async (client: SupabaseClient, roomId: string): Promise<void> => {
  await call(() => client.rpc('cancel_room', { room: roomId }));
};

export const myRooms = async (client: SupabaseClient): Promise<Room[]> =>
  decodeRooms(await call<unknown>(() => client.rpc('my_rooms')));

/** Rooms you finished together with everyone, for the +10 bonus. */
export const togetherWins = async (
  client: SupabaseClient,
): Promise<{ roomId: string; endsAt: number }[]> => {
  const rows = await call<Record<string, unknown>[]>(() => client.rpc('together_wins'));
  return (rows ?? []).flatMap((r) => {
    const endsAt = ms(r.ends_at);
    return typeof r.room_id === 'string' && endsAt !== null ? [{ roomId: r.room_id, endsAt }] : [];
  });
};

// --- Shared constellations (M7 phase 5) ------------------------------------------

/** Proposes a shape to an accepted friend. Returns the new shared constellation's id. */
export const proposeShared = async (
  client: SupabaseClient,
  friendId: string,
  draft: SharedDraft,
): Promise<string> => {
  const id = await call<string>(() =>
    client.rpc('propose_shared', {
      friend: friendId,
      source: draft.source,
      shape_id: draft.shapeId,
      seed: draft.seed,
      tier: draft.tier,
      stars_needed: draft.starsNeeded,
      min_focus_s: draft.minFocusS,
    }),
  );
  if (typeof id !== 'string') throw new FriendsFailure('unknown');
  return id;
};

/** Accept or decline a proposal made to you. */
export const respondShared = async (
  client: SupabaseClient,
  sharedId: string,
  accept: boolean,
): Promise<void> => {
  await call(() => client.rpc('respond_shared', { shared: sharedId, accept }));
};

/** Withdraw a proposal, or stop one in progress: it stays as it is, in both skies. */
export const stopShared = async (client: SupabaseClient, sharedId: string): Promise<void> => {
  await call(() => client.rpc('stop_shared', { shared: sharedId }));
};

export const myShared = async (client: SupabaseClient): Promise<SharedRow[]> =>
  decodeShared(await call<unknown>(() => client.rpc('my_shared')));
