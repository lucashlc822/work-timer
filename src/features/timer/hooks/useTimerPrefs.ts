import { useCallback, useEffect, useState } from 'react';

import { db, type SessionMode } from '@/shared/db';

import { readTimerPrefs, saveTimerPrefs, type TimerPrefs } from '../data/runRepository';
import {
  clampPomodoroSettings,
  DEFAULT_POMODORO,
  DEV_POMODORO_LIMITS,
  POMODORO_LIMITS,
} from '../domain/pomodoro';
import type { PomodoroSettings } from '../domain/types';

/** Dev builds allow one-minute blocks and breaks; production never sees them. */
export const pomodoroLimits = import.meta.env.DEV ? DEV_POMODORO_LIMITS : POMODORO_LIMITS;

export interface TimerPrefsState extends TimerPrefs {
  loaded: boolean;
  setMode: (mode: SessionMode) => void;
  setSettings: (settings: PomodoroSettings) => void;
}

/**
 * The idle screen's remembered choices: countdown or Pomodoro, and the
 * Pomodoro lengths. Saved on every change, so they survive a reload without
 * the user having to start anything.
 */
export const useTimerPrefs = (): TimerPrefsState => {
  const [prefs, setPrefs] = useState<TimerPrefs>({
    mode: 'countdown',
    settings: clampPomodoroSettings(DEFAULT_POMODORO, pomodoroLimits),
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    readTimerPrefs(db, pomodoroLimits)
      .then((stored) => {
        if (!cancelled) setPrefs(stored);
      })
      .catch((e: unknown) => console.error('Could not read timer preferences', e))
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback((patch: Partial<TimerPrefs>) => {
    setPrefs((current) => {
      const next = { ...current, ...patch };
      void saveTimerPrefs(db, next).catch((e: unknown) =>
        console.error('Could not save timer preferences', e),
      );
      return next;
    });
  }, []);

  const setMode = useCallback((mode: SessionMode) => update({ mode }), [update]);
  const setSettings = useCallback(
    (settings: PomodoroSettings) =>
      update({ settings: clampPomodoroSettings(settings, pomodoroLimits) }),
    [update],
  );

  return { ...prefs, loaded, setMode, setSettings };
};
