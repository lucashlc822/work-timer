// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useMoment } from './useMoment';

let visibility: DocumentVisibilityState = 'visible';

const setVisibility = (state: DocumentVisibilityState) => {
  visibility = state;
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
};

const reduceMotion = (on: boolean) => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: on && query.includes('reduce'),
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
};

beforeEach(() => {
  vi.useFakeTimers();
  visibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  reduceMotion(false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

describe('useMoment', () => {
  it('plays a full moment through to settled, starting once', () => {
    const onStart = vi.fn();
    const { result } = renderHook(() => useMoment('full', { present: true, onStart }));
    expect(result.current.stage).toBe('ignite');
    advance(900);
    expect(result.current.stage).toBe('arrive');
    advance(600);
    expect(result.current.stage).toBe('tally');
    advance(1500);
    expect(result.current.stage).toBe('settled');
    expect(result.current.skipped).toBe(false);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('survives StrictMode’s double mount: still plays to the end, still starts once', () => {
    const onStart = vi.fn();
    const { result } = renderHook(() => useMoment('full', { present: true, onStart }), {
      wrapper: StrictMode,
    });
    expect(result.current.stage).toBe('ignite');
    advance(3_000);
    expect(result.current.stage).toBe('settled');
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('waits while the window is hidden, and starts when it shows', () => {
    visibility = 'hidden';
    const onStart = vi.fn();
    const { result } = renderHook(() => useMoment('full', { present: true, onStart }));
    advance(10_000);
    expect(result.current.stage).toBe('waiting');
    expect(onStart).not.toHaveBeenCalled();

    setVisibility('visible');
    expect(result.current.stage).toBe('ignite');
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('waits while another view covers the timer', () => {
    const { result, rerender } = renderHook(({ present }) => useMoment('full', { present }), {
      initialProps: { present: false },
    });
    advance(5_000);
    expect(result.current.stage).toBe('waiting');
    rerender({ present: true });
    expect(result.current.stage).toBe('ignite');
  });

  it('finishes rather than pauses when the window hides part-way', () => {
    const { result } = renderHook(() => useMoment('full', { present: true }));
    advance(400);
    setVisibility('hidden');
    expect(result.current.stage).toBe('settled');
  });

  it('goes straight to settled under reduced motion, and still starts', () => {
    reduceMotion(true);
    const onStart = vi.fn();
    const { result } = renderHook(() => useMoment('full', { present: true, onStart }));
    expect(result.current.stage).toBe('settled');
    expect(result.current.skipped).toBe(true);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('skips on Escape while it plays, and leaves a handled Escape alone', () => {
    const { result } = renderHook(() => useMoment('full', { present: true }));
    const handled = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    handled.preventDefault();
    act(() => {
      document.dispatchEvent(handled);
    });
    expect(result.current.stage).toBe('ignite');

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    });
    expect(result.current.stage).toBe('settled');
    expect(result.current.skipped).toBe(true);
    // Its timers are gone: nothing moves it back.
    advance(5_000);
    expect(result.current.stage).toBe('settled');
  });

  it('stops listening for Escape once settled', () => {
    const { result } = renderHook(() => useMoment('light', { present: true }));
    advance(1_600);
    expect(result.current.stage).toBe('settled');
    const late = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    act(() => {
      document.dispatchEvent(late);
    });
    expect(late.defaultPrevented).toBe(false);
  });
});
