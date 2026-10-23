import type { SupabaseClient } from '@supabase/supabase-js';

import { classifyFriendsError, type FriendsErrorKind } from '../domain/errors';
import { decodeFriendSky, type FriendSky } from '../domain/friendSky';

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
