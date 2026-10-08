import { describe, expect, it } from 'vitest';

import {
  breakEndsAt,
  breakFor,
  breakKindAfter,
  breakRemainingMs,
  clampPomodoroSettings,
  DEFAULT_POMODORO,
  DEV_POMODORO_LIMITS,
  isBreakOver,
  POMODORO_LIMITS,
  runVerdict,
} from './pomodoro';
import type { PomodoroRun, PomodoroSettings } from './types';

const START = 1_700_000_000_000;

const onGrid = (s: PomodoroSettings) => {
  for (const key of Object.keys(POMODORO_LIMITS) as (keyof PomodoroSettings)[]) {
    const { min, max, step } = POMODORO_LIMITS[key];
    const v = s[key];
    expect(Number.isFinite(v), key).toBe(true);
    expect(v, key).toBeGreaterThanOrEqual(min);
    expect(v, key).toBeLessThanOrEqual(max);
    expect((v - min) % step, key).toBe(0);
  }
};

describe('clampPomodoroSettings', () => {
  it('keeps valid settings as they are', () => {
    expect(clampPomodoroSettings(DEFAULT_POMODORO)).toEqual(DEFAULT_POMODORO);
  });

  // O1.2
  it('makes NaN, negative, over-max and off-step values safe', () => {
    const s = clampPomodoroSettings({
      focusS: Number.NaN,
      shortBreakS: -300,
      longBreakS: 10_000_000,
      blocksPerLongBreak: 3.6,
    });
    onGrid(s);
    expect(s.focusS).toBe(DEFAULT_POMODORO.focusS);
    expect(s.shortBreakS).toBe(POMODORO_LIMITS.shortBreakS.min);
    expect(s.longBreakS).toBe(POMODORO_LIMITS.longBreakS.max);
    expect(s.blocksPerLongBreak).toBe(4);
  });

  it('snaps an off-step length to the nearest step', () => {
    expect(clampPomodoroSettings({ ...DEFAULT_POMODORO, focusS: 31 * 60 }).focusS).toBe(30 * 60);
  });

  it('treats missing, null and non-numeric input as defaults', () => {
    expect(clampPomodoroSettings(undefined)).toEqual(DEFAULT_POMODORO);
    expect(clampPomodoroSettings(null)).toEqual(DEFAULT_POMODORO);
    expect(clampPomodoroSettings({ focusS: 'lots' })).toEqual(DEFAULT_POMODORO);
  });

  it('allows one-minute blocks only under the dev limits', () => {
    const short = { ...DEFAULT_POMODORO, focusS: 60, longBreakS: 60 };
    expect(clampPomodoroSettings(short, DEV_POMODORO_LIMITS)).toEqual(short);
    expect(clampPomodoroSettings(short).focusS).toBe(5 * 60);
  });
});

describe('breaks', () => {
  // O3.6
  it('gives a long break after every Nth block and a short one otherwise', () => {
    const kinds = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => breakKindAfter(n, DEFAULT_POMODORO));
    expect(kinds).toEqual(['short', 'short', 'short', 'long', 'short', 'short', 'short', 'long']);
  });

  it('sizes the break by its kind and starts it when told', () => {
    expect(breakFor(1, DEFAULT_POMODORO, START)).toEqual({
      kind: 'short',
      startedAt: START,
      durationS: 300,
    });
    expect(breakFor(4, DEFAULT_POMODORO, START).durationS).toBe(900);
  });

  it('is over exactly at its end, and never reports more than its length left', () => {
    const b = breakFor(1, DEFAULT_POMODORO, START);
    expect(breakEndsAt(b)).toBe(START + 300_000);
    expect(isBreakOver(b, START + 299_999)).toBe(false);
    expect(isBreakOver(b, START + 300_000)).toBe(true);
    expect(breakRemainingMs(b, START + 400_000)).toBe(0);
    // Clock moved backwards past the start.
    expect(breakRemainingMs(b, START - 60_000)).toBe(300_000);
  });
});

describe('runVerdict', () => {
  const run = (overrides: Partial<PomodoroRun> = {}): PomodoroRun => ({
    id: 'run-1',
    startedAt: START,
    settings: DEFAULT_POMODORO,
    blocksDone: 1,
    break: breakFor(1, DEFAULT_POMODORO, START),
    ...overrides,
  });

  it('is on a break until the break ends, then over', () => {
    expect(runVerdict(run(), START + 1000)).toEqual({ kind: 'onBreak', remainingMs: 299_000 });
    expect(runVerdict(run(), START + 300_000)).toEqual({ kind: 'breakOver' });
  });

  it('treats a run with no break as ready for its next block', () => {
    expect(runVerdict(run({ break: null }), START)).toEqual({ kind: 'breakOver' });
  });
});
