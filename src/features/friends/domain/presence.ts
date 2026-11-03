/**
 * A friend's status at a glance (M7 presence): Focusing, On a break, Online,
 * Away or Offline.
 *
 * Two sources, never stored on this device: "Focusing now" (`focusStatus`),
 * which always wins, and presence — whether their app is open and in view.
 * The server hands over only fresh presence (refreshed within three minutes,
 * judged by its own clock), so anything missing simply reads as Offline.
 */

import { statusLine, type FocusStatus } from './focusStatus';
import { lastFocusLabel } from './lastFocus';

export type PresenceState = 'online' | 'away';

export interface Presence {
  state: PresenceState;
  /** Epoch ms, by the server's clock: when their app last said so. */
  seenAt: number;
}

export type FriendStatus = 'focusing' | 'break' | 'online' | 'away' | 'offline';

export const friendStatus = (
  focus: FocusStatus | null,
  presence: Presence | null,
  now: number,
): FriendStatus => {
  if (focus !== null && focus.until > now) return focus.kind === 'focus' ? 'focusing' : 'break';
  return presence?.state ?? 'offline';
};

/** One word or two, where a whole line won't fit (the Focus together list). */
export const STATUS_WORD: Record<FriendStatus, string> = {
  focusing: 'Focusing',
  break: 'On a break',
  online: 'Online',
  away: 'Away',
  offline: 'Offline',
};

/**
 * "Focusing now · 18 min left", "On a break · 3 min left", "Online", "Away",
 * or "Offline · Focused today" (when they last finished a session).
 */
export const friendStatusLine = (
  focus: FocusStatus | null,
  presence: Presence | null,
  lastFocusAt: number | null,
  now: number,
): string => {
  const line = statusLine(focus, now);
  if (line !== null) return line;
  switch (friendStatus(null, presence, now)) {
    case 'online':
      return 'Online';
    case 'away':
      return 'Away';
    default:
      return `Offline · ${lastFocusLabel(lastFocusAt, now)}`;
  }
};
