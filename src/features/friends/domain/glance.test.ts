import { describe, expect, it } from 'vitest';

import type { FriendRow } from '../data/friendsRepository';
import type { FocusStatus } from './focusStatus';
import { friendsGlance } from './glance';
import type { Presence } from './presence';

const NOW = 1_000_000;
const friend = (id: string, name: string | null): FriendRow => ({
  friendshipId: `f-${id}`,
  friendId: id,
  displayName: name,
  status: 'accepted',
  direction: null,
  since: 0,
  lastFocusAt: null,
});
const focusing: FocusStatus = { kind: 'focus', startedAt: NOW - 1000, until: NOW + 60_000 };
const online: Presence = { state: 'online', seenAt: NOW };
const away: Presence = { state: 'away', seenAt: NOW };

describe('friendsGlance', () => {
  it('names nobody when no one is around, and counts the friends', () => {
    const g = friendsGlance([friend('a', 'Ada')], new Map(), new Map(), NOW);
    expect(g).toEqual({ shown: [], more: 0, total: 1 });
  });

  it('puts focusing first, then online, then away, by name within a group', () => {
    const friends = [friend('a', 'Ada'), friend('b', 'Bea'), friend('c', 'Cy'), friend('d', 'Dot')];
    const g = friendsGlance(
      friends,
      new Map([['c', focusing]]),
      new Map([
        ['a', away],
        ['b', online],
        ['d', online],
      ]),
      NOW,
    );
    expect(g.shown.map((f) => `${f.name}:${f.status}`)).toEqual([
      'Cy:focusing',
      'Bea:online',
      'Dot:online',
    ]);
    expect(g.more).toBe(1);
  });

  it('ignores a focus status that has run out, and names a nameless friend', () => {
    const over: FocusStatus = { kind: 'focus', startedAt: 0, until: NOW - 1 };
    const g = friendsGlance(
      [friend('a', null)],
      new Map([['a', over]]),
      new Map([['a', online]]),
      NOW,
    );
    expect(g.shown).toEqual([{ id: 'a', name: 'A friend', status: 'online' }]);
  });
});
