import { describe, expect, it } from 'vitest';

import { MAX_CELEBRATIONS, pendingCelebrations } from './celebrate';

const done = (id: string, completedAt: number) => ({ id, completedAt });

describe('pendingCelebrations', () => {
  it('on the first run plays nothing and records everything already finished', () => {
    expect(pendingCelebrations([done('a', 1), done('b', 2)], undefined)).toEqual({
      play: [],
      markSeen: ['a', 'b'],
    });
  });

  it('on the first run with nothing finished records an empty list, so the next one plays', () => {
    const first = pendingCelebrations([], undefined);
    expect(first).toEqual({ play: [], markSeen: [] });
    expect(pendingCelebrations([done('a', 1)], first.markSeen).play).toEqual(['a']);
  });

  it('plays a constellation finished since, once', () => {
    const now = pendingCelebrations([done('old', 1), done('new', 5)], ['old']);
    expect(now).toEqual({ play: ['new'], markSeen: ['new'] });
    expect(pendingCelebrations([done('old', 1), done('new', 5)], ['old', 'new'])).toEqual({
      play: [],
      markSeen: [],
    });
  });

  it('plays at most three, newest first, and records the rest without a show', () => {
    const many = [1, 2, 3, 4, 5].map((t) => done(`c${t}`, t));
    const result = pendingCelebrations(many, []);
    expect(MAX_CELEBRATIONS).toBe(3);
    expect(result.play).toEqual(['c5', 'c4', 'c3']);
    expect([...result.markSeen].sort()).toEqual(['c1', 'c2', 'c3', 'c4', 'c5']);
  });

  it('treats shared constellations like any other, by their own id', () => {
    expect(pendingCelebrations([done('mine', 1), done('shared-1', 2)], ['mine']).play).toEqual([
      'shared-1',
    ]);
  });

  it('breaks a tie in finishing time the same way every time', () => {
    const a = pendingCelebrations([done('b', 1), done('a', 1)], [], 1).play;
    const b = pendingCelebrations([done('a', 1), done('b', 1)], [], 1).play;
    expect(a).toEqual(b);
  });
});
