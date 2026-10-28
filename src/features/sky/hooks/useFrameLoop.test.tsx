// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useFrameLoop } from './useFrameLoop';

afterEach(() => vi.unstubAllGlobals());

describe('useFrameLoop under a live reduced-motion change', () => {
  it('draws one still frame when it turns on, and resumes looping when it turns off', () => {
    const listeners = new Set<() => void>();
    const mql = {
      matches: false,
      addEventListener: (_: string, cb: () => void) => listeners.add(cb),
      removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
    };
    vi.stubGlobal('matchMedia', () => mql);
    const raf = vi.fn(() => 1);
    const cancel = vi.fn();
    vi.stubGlobal('requestAnimationFrame', raf);
    vi.stubGlobal('cancelAnimationFrame', cancel);
    const draw = vi.fn();

    const { unmount } = renderHook(() => useFrameLoop(draw));
    expect(raf).toHaveBeenCalledTimes(1);
    expect(draw).not.toHaveBeenCalled();

    mql.matches = true;
    listeners.forEach((cb) => cb());
    expect(cancel).toHaveBeenCalled();
    expect(draw).toHaveBeenCalledWith(0);

    mql.matches = false;
    listeners.forEach((cb) => cb());
    expect(raf).toHaveBeenCalledTimes(2);

    unmount();
    expect(listeners.size).toBe(0);
  });
});
