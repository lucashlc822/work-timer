/**
 * Focus-together rooms (M7 phase 4), as the server's `my_rooms` describes
 * them, and the few questions the app asks of them. Pure: rooms in, answers
 * out; the clock is always passed in.
 *
 * The server judges time (a lobby lapses after 10 minutes, a running room is
 * done at its end) and sends the result as `status`; the app re-reads often
 * enough that it never has to second-guess it, except for "has the end
 * passed" between reads.
 */

export type RoomStatus = 'lobby' | 'running' | 'cancelled' | 'lapsed' | 'done';
export type MemberState = 'invited' | 'joined' | 'declined' | 'left' | 'missed';

export interface RoomMember {
  userId: string;
  displayName: string | null;
  state: MemberState;
}

export interface Room {
  id: string;
  host: string;
  plannedDurationS: number;
  status: RoomStatus;
  createdAt: number;
  /** Epoch ms, server time; null until started. */
  startsAt: number | null;
  endsAt: number | null;
  cancelledBy: string | null;
  cancelledAt: number | null;
  /** Host first. */
  members: RoomMember[];
}

/** The longest a room can run, as the server allows. */
export const MAX_ROOM_S = 10_800;
/** At most three friends besides you. */
export const MAX_INVITEES = 3;

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const time = (v: unknown): number | null => {
  if (typeof v !== 'string') return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
};
const STATUSES: readonly string[] = ['lobby', 'running', 'cancelled', 'lapsed', 'done'];
const STATES: readonly string[] = ['invited', 'joined', 'declined', 'left', 'missed'];

const member = (v: unknown): RoomMember | null => {
  if (!isObject(v) || typeof v.user_id !== 'string' || !STATES.includes(v.state as string)) {
    return null;
  }
  return {
    userId: v.user_id,
    displayName: typeof v.display_name === 'string' ? v.display_name : null,
    state: v.state as MemberState,
  };
};

const room = (v: unknown): Room | null => {
  if (!isObject(v)) return null;
  const createdAt = time(v.created_at);
  if (
    typeof v.id !== 'string' ||
    typeof v.host !== 'string' ||
    typeof v.planned_duration_s !== 'number' ||
    !STATUSES.includes(v.status as string) ||
    createdAt === null
  ) {
    return null;
  }
  return {
    id: v.id,
    host: v.host,
    plannedDurationS: v.planned_duration_s,
    status: v.status as RoomStatus,
    createdAt,
    startsAt: time(v.starts_at),
    endsAt: time(v.ends_at),
    cancelledBy: typeof v.cancelled_by === 'string' ? v.cancelled_by : null,
    cancelledAt: time(v.cancelled_at),
    members: Array.isArray(v.members) ? v.members.flatMap((m) => member(m) ?? []) : [],
  };
};

/** `my_rooms`'s answer, newest first; rooms that can't be read are dropped. */
export const decodeRooms = (payload: unknown): Room[] =>
  (Array.isArray(payload) ? payload.flatMap((r) => room(r) ?? []) : []).sort(
    (a, b) => b.createdAt - a.createdAt,
  );

export const stateOf = (r: Room, me: string): MemberState | null =>
  r.members.find((m) => m.userId === me)?.state ?? null;

export const nameOf = (r: Room, userId: string | null): string =>
  r.members.find((m) => m.userId === userId)?.displayName ?? 'A friend';

/** Is it still on: a lobby, or running before its end. */
const isOpen = (r: Room, now: number): boolean =>
  r.status === 'lobby' || (r.status === 'running' && r.endsAt !== null && r.endsAt > now);

/** The room you're in right now (as host or having joined), if any. */
export const currentRoom = (rooms: readonly Room[], me: string, now: number): Room | null =>
  rooms.find((r) => stateOf(r, me) === 'joined' && isOpen(r, now)) ?? null;

/** The newest invitation still waiting for your answer. */
export const pendingInvite = (rooms: readonly Room[], me: string): Room | null =>
  rooms.find((r) => r.status === 'lobby' && stateOf(r, me) === 'invited') ?? null;

/** The others you're focusing with: joined members, not you. */
export const companions = (r: Room, me: string): string[] =>
  r.members
    .filter((m) => m.userId !== me && m.state === 'joined')
    .map((m) => m.displayName ?? 'A friend');

/** "Ada", "Ada and Bea", "Ada, Bea and Cy". */
export const listNames = (names: readonly string[]): string =>
  names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/**
 * Should this device start its countdown for the room now? Only for a member
 * who joined, while the room runs and before its end — a device that comes
 * back after the end has missed it, and earns nothing for time it didn't run.
 */
export const shouldAutoStart = (r: Room, me: string, now: number): boolean =>
  r.status === 'running' &&
  stateOf(r, me) === 'joined' &&
  r.startsAt !== null &&
  r.endsAt !== null &&
  now < r.endsAt;

/**
 * A friend's cancel this device must apply: the room was cancelled while
 * running, by someone else. Null when you cancelled it yourself, or it was
 * only a lobby given up.
 */
export const friendCancel = (r: Room, me: string): { at: number; endedBy: string } | null =>
  r.status === 'cancelled' &&
  r.startsAt !== null &&
  r.cancelledBy !== null &&
  r.cancelledBy !== me &&
  r.cancelledAt !== null
    ? { at: r.cancelledAt, endedBy: nameOf(r, r.cancelledBy) }
    : null;
