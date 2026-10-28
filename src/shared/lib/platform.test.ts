// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { onReducedMotionChange } from './platform';

const mockMatchMedia = () => {
  const listeners = new Set<() => void>();
  const mql = {
    matches: false,
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  };
  vi.stubGlobal('matchMedia', () => mql);
  return { fire: () => listeners.forEach((cb) => cb()), listeners };
};

afterEach(() => vi.unstubAllGlobals());

describe('onReducedMotionChange', () => {
  it('calls back when the setting changes', () => {
    const media = mockMatchMedia();
    const cb = vi.fn();
    onReducedMotionChange(cb);
    media.fire();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('stops calling back after unsubscribe', () => {
    const media = mockMatchMedia();
    const cb = vi.fn();
    onReducedMotionChange(cb)();
    media.fire();
    expect(cb).not.toHaveBeenCalled();
    expect(media.listeners.size).toBe(0);
  });

  it('is a safe no-op without matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(() => onReducedMotionChange(() => {})()).not.toThrow();
  });
});
