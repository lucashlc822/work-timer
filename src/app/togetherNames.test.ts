import { describe, expect, it } from 'vitest';

import type { Room } from '@/features/friends';

import { mergeTogetherNames } from './togetherNames';

const ME = 'me';
const room = (o: Partial<Room>): Room => ({
  id: 'r1',
  host: ME,
  plannedDurationS: 1500,
  status: 'done',
  createdAt: 1000,
  startsAt: 2000,
  endsAt: 3500,
  cancelledBy: null,
  cancelledAt: null,
  members: [
    { userId: ME, displayName: 'Lucas', state: 'joined' },
    { userId: 'mia', displayName: 'mia', state: 'joined' },
    { userId: 'bea', displayName: 'Bea', state: 'declined' },
  ],
  ...o,
});

describe('mergeTogetherNames', () => {
  it('remembers the others who were in a room you ran, not you and not those who declined', () => {
    expect(mergeTogetherNames([room({})], ME, undefined)).toEqual({
      r1: { names: ['mia'], startsAt: 2000 },
    });
  });

  it('remembers rooms that ran or began to, never a lobby that did not start', () => {
    const merged = mergeTogetherNames(
      [
        room({ id: 'running', status: 'running' }),
        room({ id: 'cancelled', status: 'cancelled' }),
        room({ id: 'lobby', status: 'lobby', startsAt: null }),
        room({ id: 'lapsed', status: 'lapsed', startsAt: null }),
      ],
      ME,
      undefined,
    );
    expect(Object.keys(merged ?? {}).sort()).toEqual(['cancelled', 'running']);
  });

  it('skips a room you did not run in', () => {
    const r = room({
      members: [
        { userId: ME, displayName: 'Lucas', state: 'declined' },
        { userId: 'mia', displayName: 'mia', state: 'joined' },
      ],
    });
    expect(mergeTogetherNames([r], ME, undefined)).toBeNull();
  });

  it('leaves out someone with no display name, so nobody named reads as "together"', () => {
    const r = room({
      members: [
        { userId: ME, displayName: 'Lucas', state: 'joined' },
        { userId: 'x', displayName: null, state: 'joined' },
      ],
    });
    expect(mergeTogetherNames([r], ME, undefined)).toEqual({ r1: { names: [], startsAt: 2000 } });
  });

  it('writes nothing when it already knows the room', () => {
    expect(
      mergeTogetherNames([room({})], ME, { r1: { names: ['mia'], startsAt: 2000 } }),
    ).toBeNull();
  });

  it('keeps what it knew about rooms the server no longer lists', () => {
    const merged = mergeTogetherNames([room({ id: 'new' })], ME, {
      old: { names: ['Kai'], startsAt: 1 },
    });
    expect(merged).toEqual({
      old: { names: ['Kai'], startsAt: 1 },
      new: { names: ['mia'], startsAt: 2000 },
    });
  });

  it('forgets the oldest rooms beyond the cap', () => {
    const known = { a: { names: ['A'], startsAt: 1 }, b: { names: ['B'], startsAt: 2 } };
    const merged = mergeTogetherNames([room({ id: 'c', startsAt: 3 })], ME, known, 2);
    expect(Object.keys(merged ?? {}).sort()).toEqual(['b', 'c']);
  });
});
