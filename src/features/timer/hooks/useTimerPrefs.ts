import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useState } from 'react';

import { db, type SessionMode } from '@/shared/db';

import { readTimerPrefs, updateTimerPrefs, type TimerPrefs } from '../data/runRepository';
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
  setTagId: (tagId: string | null) => void;
}

const sameSettings = (a: PomodoroSettings, b: PomodoroSettings): boolean =>
  a.focusS === b.focusS &&
  a.shortBreakS === b.shortBreakS &&
  a.longBreakS === b.longBreakS &&
  a.blocksPerLongBreak === b.blocksPerLongBreak;

const DEFAULTS: TimerPrefs = {
  mode: 'countdown',
  settings: clampPomodoroSettings(DEFAULT_POMODORO, pomodoroLimits),
  tagId: null,
};

/**
 * The idle screen's remembered choices: countdown or Pomodoro, the Pomodoro
 * lengths, and the last tag. Saved on every change, so they survive a reload
 * without the user having to start anything.
 *
 * Read live from the store rather than held in component state, so settings
 * synced from another of the account's devices show up here as they arrive.
 * A run already under way is unaffected: it keeps its own copy of the lengths.
 *
 * The store write is asynchronous, so the lengths the user just set are also
 * held in `pending` and returned in place of the stored ones until the store
 * catches up. Without it, a burst of key presses on a slider each started from
 * the old stored value and all but one were lost.
 */
export const useTimerPrefs = (): TimerPrefsState => {
  const stored = useLiveQuery(() => readTimerPrefs(db, pomodoroLimits), []);

  const [pending, setPending] = useState<PomodoroSettings | null>(null);

  // Drop the held value once the store shows it, so a later change from sync
  // is seen again.
  useEffect(() => {
    if (pending !== null && stored !== undefined && sameSettings(stored.settings, pending)) {
      setPending(null);
    }
  }, [stored, pending]);

  const update = useCallback((patch: Partial<TimerPrefs>) => {
    void updateTimerPrefs(db, patch, pomodoroLimits, Date.now()).catch((e: unknown) => {
      if (patch.settings !== undefined) setPending(null);
      console.error('Could not save timer preferences', e);
    });
  }, []);

  const setMode = useCallback((mode: SessionMode) => update({ mode }), [update]);
  const setSettings = useCallback(
    (settings: PomodoroSettings) => {
      const clamped = clampPomodoroSettings(settings, pomodoroLimits);
      setPending(clamped);
      update({ settings: clamped });
    },
    [update],
  );
  const setTagId = useCallback((tagId: string | null) => update({ tagId }), [update]);

  const prefs = stored ?? DEFAULTS;
  return {
    ...prefs,
    settings: pending ?? prefs.settings,
    loaded: stored !== undefined,
    setMode,
    setSettings,
    setTagId,
  };
};
