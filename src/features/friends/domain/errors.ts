/**
 * The ways a friends action can fail, and what to tell the person.
 *
 * The server's friends functions refuse with a stable code as the message
 * (`friend_code_not_found`, ...; see the M7 migration). Anything that got no
 * answer at all is "offline".
 */

export type FriendsErrorKind =
  | 'nameRequired'
  | 'invalidName'
  | 'codeNotFound'
  | 'ownCode'
  | 'alreadyFriends'
  | 'alreadySent'
  | 'tooManyPending'
  | 'notFound'
  | 'notFriends'
  | 'invalidRoom'
  | 'tooManyInvited'
  | 'alreadyInRoom'
  | 'roomNotFound'
  | 'roomClosed'
  | 'nobodyJoined'
  | 'sharedAlreadyOpen'
  | 'sharedNotFound'
  | 'invalidShared'
  | 'offline'
  | 'unknown';

export const FRIENDS_MESSAGES: Record<FriendsErrorKind, string> = {
  nameRequired: 'Pick a name first, so your friend knows who is asking.',
  invalidName: 'Names are 1 to 24 characters, on one line.',
  codeNotFound: 'No one has that code. Check it and try again.',
  ownCode: "That's your own code.",
  alreadyFriends: "You're already friends.",
  alreadySent: 'You already sent them a request.',
  tooManyPending: 'You have 20 requests waiting. Cancel some before sending more.',
  notFound: 'That request or friend is gone. The list has been refreshed.',
  notFriends: "You're no longer friends.",
  invalidRoom: 'Pick at least one friend and a length.',
  tooManyInvited: 'You can focus with up to three friends at once.',
  alreadyInRoom: "You're already in a session with friends.",
  roomNotFound: 'That session is gone.',
  roomClosed: 'That session has already started, ended or lapsed.',
  nobodyJoined: 'Wait until a friend has joined, then start.',
  sharedAlreadyOpen:
    'You already have a shared constellation with them. Finish or stop it to start another.',
  sharedNotFound: 'That shared constellation is gone. The list has been refreshed.',
  invalidShared: "That constellation can't be shared. Pick another.",
  offline: 'Connect to see your friends.',
  unknown: 'Something went wrong. Try again in a moment.',
};

const SERVER_CODES: Record<string, FriendsErrorKind> = {
  display_name_required: 'nameRequired',
  invalid_display_name: 'invalidName',
  friend_code_not_found: 'codeNotFound',
  cannot_friend_self: 'ownCode',
  already_friends: 'alreadyFriends',
  request_already_sent: 'alreadySent',
  too_many_pending: 'tooManyPending',
  request_not_found: 'notFound',
  friendship_not_found: 'notFound',
  not_friends: 'notFriends',
  invalid_room: 'invalidRoom',
  too_many: 'tooManyInvited',
  already_in_room: 'alreadyInRoom',
  room_not_found: 'roomNotFound',
  room_closed: 'roomClosed',
  nobody_joined: 'nobodyJoined',
  shared_already_open: 'sharedAlreadyOpen',
  shared_not_found: 'sharedNotFound',
  invalid_shared: 'invalidShared',
};

/** What classification needs from a supabase-js error and its response. */
export interface FriendsErrorLike {
  message?: string | undefined;
  code?: string | undefined;
  /** The HTTP status of the response, when one arrived; 0 or absent when none did. */
  status?: number | undefined;
}

export const classifyFriendsError = (error: FriendsErrorLike): FriendsErrorKind => {
  const message = (error.message ?? '').trim();
  const known = SERVER_CODES[message];
  if (known !== undefined) return known;

  const status = error.status;
  const lower = message.toLowerCase();
  const noAnswer =
    status === 0 ||
    (status !== undefined && status >= 502 && status <= 504) ||
    lower.includes('failed to fetch') ||
    lower.includes('fetch failed') ||
    lower.includes('networkerror') ||
    (typeof navigator !== 'undefined' && navigator.onLine === false);
  return noAnswer ? 'offline' : 'unknown';
};

/**
 * What a failed load of the friends list says. "Offline" covers two different
 * things, so it asks the browser which: no connection at all, or a connection
 * with the server out of reach.
 */
export const friendsLoadMessage = (load: 'offline' | 'error', online: boolean): string => {
  if (load === 'error') return FRIENDS_MESSAGES.unknown;
  return online
    ? "Couldn't reach the server. Try again in a moment."
    : "You're offline. Your friends will show when you reconnect.";
};
