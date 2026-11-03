// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sent = vi.hoisted(() => ({ set: vi.fn(), clear: vi.fn() }));
vi.mock('@/shared/backend', () => ({ getSupabase: () => ({}) }));
vi.mock('../data/friendsRepository', () => ({
  setPresence: (_: unknown, state: string) => {
    sent.set(state);
    return Promise.resolve();
  },
  clearPresence: () => {
    sent.clear();
    return Promise.resolve();
  },
}));

import { PRESENCE_BEAT_MS, PRESENCE_IDLE_MS, useSharePresence } from './useSharePresence';

let visibility: DocumentVisibilityState = 'visible';
const setVisibility = (v: DocumentVisibilityState) => {
  visibility = v;
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
};
const states = () => sent.set.mock.calls.map((c) => c[0] as string);

beforeEach(() => {
  vi.useFakeTimers();
  visibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  sent.set.mockClear();
  sent.clear.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useSharePresence', () => {
  it('says Online on open, Away when hidden, Online again when back', () => {
    renderHook(() => useSharePresence({ share: true }));
    expect(states()).toEqual(['online']);
    setVisibility('hidden');
    expect(states()).toEqual(['online', 'away']);
    setVisibility('visible');
    expect(states()).toEqual(['online', 'away', 'online']);
  });

  it('repeats itself every beat, so the server keeps it fresh', () => {
    renderHook(() => useSharePresence({ share: true }));
    // One beat per act: React would batch ticks advanced together into one render.
    for (let i = 0; i < 3; i++) {
      act(() => {
        vi.advanceTimersByTime(PRESENCE_BEAT_MS);
      });
    }
    expect(states()).toEqual(['online', 'online', 'online', 'online']);
  });

  it('goes Away after ten minutes without input, and back on the next touch', () => {
    renderHook(() => useSharePresence({ share: true }));
    act(() => {
      vi.advanceTimersByTime(PRESENCE_IDLE_MS);
    });
    expect(states().at(-1)).toBe('away');
    const before = states().length;
    act(() => {
      window.dispatchEvent(new Event('keydown'));
    });
    expect(states().slice(before)).toEqual(['online']);
  });

  it('sends nothing while sharing is off, and starts again when it is on', () => {
    const { rerender } = renderHook(({ share }) => useSharePresence({ share }), {
      initialProps: { share: false },
    });
    setVisibility('hidden');
    act(() => {
      vi.advanceTimersByTime(2 * PRESENCE_BEAT_MS);
    });
    expect(states()).toEqual([]);
    rerender({ share: true });
    expect(states()).toEqual(['away']);
  });

  it('clears itself when the page goes away, unless sharing is off', () => {
    const { rerender } = renderHook(({ share }) => useSharePresence({ share }), {
      initialProps: { share: true },
    });
    window.dispatchEvent(new Event('pagehide'));
    expect(sent.clear).toHaveBeenCalledTimes(1);
    rerender({ share: false });
    window.dispatchEvent(new Event('pagehide'));
    expect(sent.clear).toHaveBeenCalledTimes(1);
  });
});
