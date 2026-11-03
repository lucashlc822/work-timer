import { describe, expect, it } from 'vitest';

import {
  companions,
  currentRoom,
  decodeRooms,
  friendCancel,
  isLobby,
  listNames,
  lobbyEnded,
  lobbyMinutesLeft,
  missedStart,
  nobodyComing,
  pendingInvite,
  shouldAutoStart,
  type Room,
} from './room';

const ME = 'me';
const NOW = Date.parse('2026-10-24T10:10:00Z');

// The shape `my_rooms` returns (supabase/migrations/*_m7_together.sql).
const wire = (over: Record<string, unknown> = {}) => ({
  id: 'room-1',
  host: 'ada',
  planned_duration_s: 1500,
  status: 'running',
  created_at: '2026-10-24T10:00:00+00:00',
  starts_at: '2026-10-24T10:05:00+00:00',
  ends_at: '2026-10-24T10:30:00+00:00',
  cancelled_by: null,
  cancelled_at: null,
  members: [
    { user_id: 'ada', display_name: 'Ada', state: 'joined' },
    { user_id: ME, display_name: 'Me', state: 'joined' },
    { user_id: 'bea', display_name: 'Bea', state: 'joined' },
    { user_id: 'cy', display_name: 'Cy', state: 'missed' },
  ],
  ...over,
});

const one = (over: Record<string, unknown> = {}): Room => decodeRooms([wire(over)])[0]!;

describe('decodeRooms', () => {
  it('reads a real answer, newest first, and drops what it can’t read', () => {
    const rooms = decodeRooms([
      wire({ id: 'old', created_at: '2026-10-24T09:00:00Z' }),
      wire({ id: 'new' }),
      { id: 'broken' },
      'nonsense',
    ]);
    expect(rooms.map((r) => r.id)).toEqual(['new', 'old']);
    expect(rooms[0]).toMatchObject({
      host: 'ada',
      plannedDurationS: 1500,
      status: 'running',
      startsAt: Date.parse('2026-10-24T10:05:00Z'),
      endsAt: Date.parse('2026-10-24T10:30:00Z'),
    });
    expect(decodeRooms(null)).toEqual([]);
  });
});

describe('which room matters now', () => {
  it('the room you joined, while open; not after its end', () => {
    expect(currentRoom([one()], ME, NOW)?.id).toBe('room-1');
    expect(
      currentRoom([one({ status: 'lobby', starts_at: null, ends_at: null })], ME, NOW)?.id,
    ).toBe('room-1');
    expect(currentRoom([one()], ME, Date.parse('2026-10-24T10:31:00Z'))).toBeNull();
    expect(currentRoom([one({ status: 'cancelled' })], ME, NOW)).toBeNull();
  });

  it('an invitation waits only while its lobby does', () => {
    const invited = (status: string) =>
      one({
        status,
        starts_at: null,
        ends_at: null,
        members: [
          { user_id: 'ada', display_name: 'Ada', state: 'joined' },
          { user_id: ME, display_name: 'Me', state: 'invited' },
        ],
      });
    expect(pendingInvite([invited('lobby')], ME)?.id).toBe('room-1');
    expect(pendingInvite([invited('lapsed')], ME)).toBeNull();
    expect(pendingInvite([invited('cancelled')], ME)).toBeNull();
  });

  it('names the others you focus with, joined only', () => {
    expect(companions(one(), ME)).toEqual(['Ada', 'Bea']);
    expect(listNames(['Ada'])).toBe('Ada');
    expect(listNames(['Ada', 'Bea'])).toBe('Ada and Bea');
    expect(listNames(['Ada', 'Bea', 'Cy'])).toBe('Ada, Bea and Cy');
  });
});

describe('shouldAutoStart', () => {
  it('starts a joined member’s countdown while the room runs', () => {
    expect(shouldAutoStart(one(), ME, NOW)).toBe(true);
  });
  it('not after the end, not in the lobby, not for someone who missed it', () => {
    expect(shouldAutoStart(one(), ME, Date.parse('2026-10-24T10:30:00Z'))).toBe(false);
    expect(shouldAutoStart(one({ status: 'lobby' }), ME, NOW)).toBe(false);
    expect(shouldAutoStart(one(), 'cy', NOW)).toBe(false);
  });
});

describe('isLobby', () => {
  it('only a room still gathering people', () => {
    expect(isLobby(one({ status: 'lobby', starts_at: null, ends_at: null }))).toBe(true);
    expect(isLobby(one())).toBe(false);
    expect(isLobby(one({ status: 'lapsed' }))).toBe(false);
    expect(isLobby(null)).toBe(false);
  });
});

describe('the lobby', () => {
  const lobby = (over: Record<string, unknown> = {}) =>
    one({ status: 'lobby', starts_at: null, ends_at: null, ...over });

  it('counts down the invitation’s ten minutes, rounded up', () => {
    // Created 10:00, now 10:10 in the fixtures; move the creation to suit.
    expect(lobbyMinutesLeft(lobby({ created_at: '2026-10-24T10:10:00Z' }), NOW)).toBe(10);
    expect(lobbyMinutesLeft(lobby({ created_at: '2026-10-24T10:01:30Z' }), NOW)).toBe(2);
    expect(lobbyMinutesLeft(lobby(), NOW)).toBe(0);
  });

  it('knows when nobody but the host is still coming', () => {
    const members = (...states: string[]) =>
      lobby({
        members: [
          { user_id: 'ada', display_name: 'Ada', state: 'joined' },
          ...states.map((state, i) => ({ user_id: `f${i}`, display_name: `F${i}`, state })),
        ],
      });
    expect(nobodyComing(members('declined', 'left'))).toBe(true);
    expect(nobodyComing(members('declined', 'invited'))).toBe(false);
    expect(nobodyComing(members('joined'))).toBe(false);
  });
});

describe('lobbyEnded', () => {
  const ended = (over: Record<string, unknown>) => one({ starts_at: null, ends_at: null, ...over });

  it('a lobby the host closed, for the others, for five minutes', () => {
    const closed = ended({
      status: 'cancelled',
      cancelled_by: 'ada',
      cancelled_at: '2026-10-24T10:08:00Z',
    });
    expect(lobbyEnded([closed], ME, NOW)).toMatchObject({ why: 'closed', room: { id: 'room-1' } });
    expect(lobbyEnded([closed], 'ada', NOW)).toBeNull();
    expect(lobbyEnded([closed], ME, Date.parse('2026-10-24T10:13:00Z'))).toBeNull();
  });

  it('a lobby that ran out of time', () => {
    const lapsed = ended({ status: 'lapsed', created_at: '2026-10-24T09:59:00Z' });
    expect(lobbyEnded([lapsed], ME, NOW)).toMatchObject({ why: 'lapsed' });
    expect(lobbyEnded([lapsed], ME, Date.parse('2026-10-24T10:15:00Z'))).toBeNull();
  });

  it('nothing for an open lobby, a room that started, or one you never joined', () => {
    const lapsed = ended({ status: 'lapsed', created_at: '2026-10-24T09:59:00Z' });
    expect(lobbyEnded([ended({ status: 'lobby' }), lapsed], ME, NOW)).toBeNull();
    expect(
      lobbyEnded([one({ status: 'cancelled', cancelled_by: 'ada' }), lapsed], ME, NOW),
    ).toBeNull();
    expect(lobbyEnded([lapsed], 'cy', NOW)).toBeNull();
  });
});

describe('missedStart', () => {
  it('the room started but this device runs some other session', () => {
    expect(missedStart(one(), ME, null, NOW)?.id).toBe('room-1');
    expect(missedStart(one(), ME, 'other-room', NOW)?.id).toBe('room-1');
  });
  it('nothing when running the room itself, after its end, or not in it', () => {
    expect(missedStart(one(), ME, 'room-1', NOW)).toBeNull();
    expect(missedStart(one(), ME, null, Date.parse('2026-10-24T10:30:00Z'))).toBeNull();
    expect(missedStart(one(), 'cy', null, NOW)).toBeNull();
    expect(missedStart(one({ status: 'lobby' }), ME, null, NOW)).toBeNull();
    expect(missedStart(null, ME, null, NOW)).toBeNull();
  });
});

describe('friendCancel', () => {
  const cancelled = (by: string) =>
    one({ status: 'cancelled', cancelled_by: by, cancelled_at: '2026-10-24T10:09:30Z' });

  it('a friend’s cancel carries when and who', () => {
    expect(friendCancel(cancelled('bea'), ME)).toEqual({
      at: Date.parse('2026-10-24T10:09:30Z'),
      endedBy: 'Bea',
    });
  });
  it('nothing to apply for your own cancel, a running room, or a lobby given up', () => {
    expect(friendCancel(cancelled(ME), ME)).toBeNull();
    expect(friendCancel(one(), ME)).toBeNull();
    expect(
      friendCancel(
        one({
          status: 'cancelled',
          starts_at: null,
          ends_at: null,
          cancelled_by: 'ada',
          cancelled_at: '2026-10-24T10:01:00Z',
        }),
        ME,
      ),
    ).toBeNull();
  });
});
