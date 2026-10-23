import { expect } from '@playwright/test';

import { adminClient, newId, signedInClient, type TestUser } from './users';

/**
 * Setting up friendships through the API (M7), for tests about what comes
 * after: viewing a friend's sky, the a11y scan. The Friends panel itself is
 * driven through the page in `web/friends.spec.ts`.
 */

const rpc = async (user: TestUser, fn: string, args?: Record<string, unknown>) => {
  const client = await signedInClient(user);
  const { data, error } = (await client.rpc(fn, args)) as { data: unknown; error: unknown };
  expect(error, fn).toBeNull();
  return data;
};

export const setName = (user: TestUser, name: string) => rpc(user, 'set_display_name', { name });

export const friendCode = async (user: TestUser): Promise<string> => {
  const { data, error } = await adminClient()
    .from('profiles')
    .select('friend_code')
    .eq('user_id', user.id)
    .single();
  expect(error).toBeNull();
  return (data as { friend_code: string }).friend_code;
};

/** `from` asks `to`; both need names first. */
export const requestFriend = async (from: TestUser, to: TestUser): Promise<void> => {
  await rpc(from, 'request_friend', { code: await friendCode(to) });
};

/** Makes the two friends: each asks the other, which accepts the first request. */
export const befriend = async (a: TestUser, b: TestUser): Promise<void> => {
  await requestFriend(a, b);
  await requestFriend(b, a);
};

export const unfriend = async (a: TestUser): Promise<void> => {
  const rows = (await rpc(a, 'my_friends')) as { friendship_id: string }[];
  for (const row of rows) await rpc(a, 'remove_friend', { friendship_id: row.friendship_id });
};

/** A completed session on the server, ending `endedMinutesAgo` ago. */
export const addCompletedSession = async (
  user: TestUser,
  focusMin: number,
  endedMinutesAgo = 5,
): Promise<void> => {
  const ended = Date.now() - endedMinutesAgo * 60_000;
  const { error } = await adminClient()
    .from('sessions')
    .insert({
      id: newId(),
      user_id: user.id,
      mode: 'countdown',
      planned_duration_s: focusMin * 60,
      actual_focus_s: focusMin * 60,
      started_at: new Date(ended - focusMin * 60_000).toISOString(),
      ended_at: new Date(ended).toISOString(),
      outcome: 'completed',
      seed: `e2e-${newId()}`,
      device: 'e2e',
      client_created_at: new Date(ended).toISOString(),
    });
  expect(error).toBeNull();
};
