import { describe, expect, it } from 'vitest';

import { formatCode, normalizeCode } from './code';
import { classifyFriendsError, friendsLoadMessage } from './errors';
import { decodeFriendSky } from './friendSky';
import { lastFocusLabel } from './lastFocus';

describe('friend codes', () => {
  it('shows a code in two groups of three', () => {
    expect(formatCode('K7Q2MX')).toBe('K7Q-2MX');
    expect(formatCode('nonsense')).toBe('nonsense');
  });

  it('reads a code however it was typed', () => {
    expect(normalizeCode('k7q 2mx')).toBe('K7Q2MX');
    expect(normalizeCode(' K7Q-2MX ')).toBe('K7Q2MX');
  });

  it('refuses what cannot be a code', () => {
    expect(normalizeCode('K7Q2M')).toBeNull();
    expect(normalizeCode('K7Q2MXX')).toBeNull();
    expect(normalizeCode('K0Q2MX')).toBeNull(); // zero is never issued
    expect(normalizeCode('KOQ2MX')).toBeNull(); // nor the letter O
    expect(normalizeCode('')).toBeNull();
  });
});

describe('classifyFriendsError', () => {
  it('names each refusal the server sends', () => {
    expect(
      classifyFriendsError({ message: 'friend_code_not_found', code: 'P0001', status: 400 }),
    ).toBe('codeNotFound');
    expect(classifyFriendsError({ message: 'cannot_friend_self' })).toBe('ownCode');
    expect(classifyFriendsError({ message: 'request_already_sent' })).toBe('alreadySent');
    expect(classifyFriendsError({ message: 'already_friends' })).toBe('alreadyFriends');
    expect(classifyFriendsError({ message: 'display_name_required' })).toBe('nameRequired');
    expect(classifyFriendsError({ message: 'invalid_display_name' })).toBe('invalidName');
    expect(classifyFriendsError({ message: 'too_many_pending' })).toBe('tooManyPending');
    expect(classifyFriendsError({ message: 'not_friends' })).toBe('notFriends');
    expect(classifyFriendsError({ message: 'request_not_found' })).toBe('notFound');
    expect(classifyFriendsError({ message: 'friendship_not_found' })).toBe('notFound');
  });

  it('calls it offline when no answer arrived', () => {
    expect(classifyFriendsError({ message: 'TypeError: Failed to fetch', status: 0 })).toBe(
      'offline',
    );
    expect(classifyFriendsError({ message: 'Bad gateway', status: 502 })).toBe('offline');
  });

  it('calls anything else unknown', () => {
    expect(classifyFriendsError({ message: 'permission denied', status: 403 })).toBe('unknown');
  });
});

describe('decodeFriendSky', () => {
  // The shape the server's friend_sky returns (supabase/migrations/*_m7_friends.sql).
  const payload = {
    display_name: 'Ada',
    sky_theme: 'dusk',
    sessions: [
      {
        id: 's1',
        seed: 'seed-1',
        started_at: '2026-10-20T09:00:00+00:00',
        ended_at: '2026-10-20T09:25:00+00:00',
        actual_focus_s: 1500,
        outcome: 'completed',
        star_style: 'style.ember',
      },
      {
        id: 's2',
        seed: 'seed-2',
        started_at: '2026-10-21T09:00:00+00:00',
        ended_at: '2026-10-21T09:10:00+00:00',
        actual_focus_s: 600,
        outcome: 'cancelled',
        star_style: null,
      },
    ],
    constellations: [
      {
        id: 'c1',
        source: 'catalogue',
        shape_id: 'kite',
        seed: null,
        tier: 'easy',
        chosen_at: '2026-10-19T12:00:00+00:00',
      },
    ],
  };

  it('reads a real friend_sky answer', () => {
    expect(decodeFriendSky(payload)).toEqual({
      displayName: 'Ada',
      themeKey: 'dusk',
      sessions: [
        {
          id: 's1',
          seed: 'seed-1',
          startedAt: Date.parse('2026-10-20T09:00:00Z'),
          endedAt: Date.parse('2026-10-20T09:25:00Z'),
          actualFocusS: 1500,
          outcome: 'completed',
          starStyle: 'style.ember',
        },
        {
          id: 's2',
          seed: 'seed-2',
          startedAt: Date.parse('2026-10-21T09:00:00Z'),
          endedAt: Date.parse('2026-10-21T09:10:00Z'),
          actualFocusS: 600,
          outcome: 'cancelled',
        },
      ],
      choices: [
        {
          id: 'c1',
          source: 'catalogue',
          shapeId: 'kite',
          seed: null,
          tier: 'easy',
          chosenAt: Date.parse('2026-10-19T12:00:00Z'),
        },
      ],
    });
  });

  it('drops rows it cannot read and keeps the rest', () => {
    const sky = decodeFriendSky({
      ...payload,
      sessions: [...payload.sessions, { id: 'bad', outcome: 'completed' }, 'nonsense'],
      constellations: [
        ...payload.constellations,
        { ...payload.constellations[0], tier: 'legendary' },
      ],
      some_future_field: true,
    });
    expect(sky?.sessions.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(sky?.choices.map((c) => c.id)).toEqual(['c1']);
  });

  it('is fine with an empty sky, and refuses what is not a sky', () => {
    expect(
      decodeFriendSky({ display_name: null, sky_theme: null, sessions: [], constellations: [] }),
    ).toEqual({ displayName: null, themeKey: null, sessions: [], choices: [] });
    expect(decodeFriendSky(null)).toBeNull();
    expect(decodeFriendSky([])).toBeNull();
  });
});

describe('lastFocusLabel', () => {
  const now = new Date(2026, 9, 22, 15, 0).getTime();
  it('says when, by calendar day', () => {
    expect(lastFocusLabel(null, now)).toBe('Not focused yet');
    expect(lastFocusLabel(new Date(2026, 9, 22, 0, 5).getTime(), now)).toBe('Focused today');
    expect(lastFocusLabel(new Date(2026, 9, 21, 23, 55).getTime(), now)).toBe('Focused yesterday');
    expect(lastFocusLabel(new Date(2026, 9, 19, 12, 0).getTime(), now)).toBe('Focused 3 days ago');
  });
});

describe('friendsLoadMessage', () => {
  it('says the connection is down when the browser knows it is offline', () => {
    expect(friendsLoadMessage('offline', false)).toBe(
      "You're offline. Your friends will show when you reconnect.",
    );
  });

  it('blames the server when the browser is online but nothing answered', () => {
    expect(friendsLoadMessage('offline', true)).toBe(
      "Couldn't reach the server. Try again in a moment.",
    );
  });

  it('keeps the general message for anything else that went wrong, online or not', () => {
    expect(friendsLoadMessage('error', true)).toBe('Something went wrong. Try again in a moment.');
    expect(friendsLoadMessage('error', false)).toBe('Something went wrong. Try again in a moment.');
  });
});
