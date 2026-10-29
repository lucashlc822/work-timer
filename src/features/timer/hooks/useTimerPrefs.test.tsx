// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';

import { bindAccountDb, db, META_KEYS, writeMeta } from '@/shared/db';

import { readTimerPrefs } from '../data/runRepository';
import { useTimerPrefs, pomodoroLimits } from './useTimerPrefs';

beforeAll(() => {
  bindAccountDb('timer-prefs-test');
});

describe('useTimerPrefs settings', () => {
  it('keeps every step of a burst of synchronous changes', async () => {
    const { result } = renderHook(() => useTimerPrefs());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const start = result.current.settings.focusS;
    const step = pomodoroLimits.focusS.step;

    // One synchronous act per press: React re-renders between presses, the
    // store write does not finish.
    for (let i = 1; i <= 10; i++) {
      act(() => {
        const s = result.current.settings;
        result.current.setSettings({ ...s, focusS: s.focusS + step });
      });
    }

    expect(result.current.settings.focusS).toBe(start + 10 * step);
    await waitFor(async () => {
      expect((await readTimerPrefs(db, pomodoroLimits)).settings.focusS).toBe(start + 10 * step);
    });
    await waitFor(() => expect(result.current.settings.focusS).toBe(start + 10 * step));
  });

  it('shows a value written to the store while nothing is pending (as sync does)', async () => {
    const { result } = renderHook(() => useTimerPrefs());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const target = { ...result.current.settings, shortBreakS: 17 * 60 };

    await act(async () => {
      await writeMeta(db, META_KEYS.pomodoroSettings, target);
    });

    await waitFor(() => expect(result.current.settings.shortBreakS).toBe(17 * 60));
  });
});
