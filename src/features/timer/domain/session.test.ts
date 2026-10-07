import { describe, expect, it } from 'vitest';

import { createTestClock } from '@/shared/lib';

import { clampCustomMinutes, DEFAULT_MINUTES } from './durations';
import { formatDuration, formatRemaining } from './format';
import { resumeVerdict } from './resume';
import {
  cancelledEnding,
  completedEnding,
  elapsedMs,
  isComplete,
  plannedEndAt,
  progress,
  remainingMs,
} from './session';
import type { ActiveSession } from './types';

const START = 1_700_000_000_000;

const aSession = (overrides: Partial<ActiveSession> = {}): ActiveSession => ({
  id: 'session-1',
  startedAt: START,
  plannedDurationS: 1500,
  seed: 'abcdef0123456789',
  tagId: null,
  device: 'desktop/app',
  awayMs: 0,
  ...overrides,
});

describe('session arithmetic', () => {
  // O1.3 — elapsed is a wall-clock delta, independent of how many ticks fired.
  it('measures elapsed time from timestamps, not from ticks', () => {
    const clock = createTestClock(START);
    const session = aSession();

    // One big jump with no ticks in between, as when a hidden window is throttled.
    clock.advance(10 * 60_000);
    const afterOneJump = elapsedMs(session, clock.now());

    // The same wall-clock span reached by a thousand small steps.
    const stepped = createTestClock(START);
    for (let i = 0; i < 1000; i += 1) stepped.advance(600);

    expect(afterOneJump).toBe(600_000);
    expect(elapsedMs(session, stepped.now())).toBe(afterOneJump);
    expect(remainingMs(session, clock.now())).toBe(900_000);
  });

  // O1.4 — the device clock moved backwards past the start.
  it('clamps elapsed to zero when the clock moves backwards', () => {
    const clock = createTestClock(START);
    const session = aSession();

    clock.skew(-5 * 60_000);

    expect(() => elapsedMs(session, clock.now())).not.toThrow();
    expect(elapsedMs(session, clock.now())).toBe(0);
    expect(remainingMs(session, clock.now())).toBe(1_500_000);
    expect(isComplete(session, clock.now())).toBe(false);
  });

  it('never reports negative remaining time after the end', () => {
    const session = aSession();
    expect(remainingMs(session, plannedEndAt(session) + 3_600_000)).toBe(0);
    expect(progress(session, plannedEndAt(session) + 3_600_000)).toBe(1);
  });

  it('is complete exactly at the planned end, not a millisecond before', () => {
    const session = aSession();
    expect(isComplete(session, plannedEndAt(session) - 1)).toBe(false);
    expect(isComplete(session, plannedEndAt(session))).toBe(true);
  });
});

describe('endings', () => {
  it('credits the full planned duration on completion, ending at the planned end', () => {
    expect(completedEnding(aSession())).toEqual({
      outcome: 'completed',
      endedAt: START + 1_500_000,
      actualFocusS: 1500,
    });
  });

  it('credits whole elapsed seconds on cancel', () => {
    const ending = cancelledEnding(aSession(), START + 61_900);
    expect(ending).toEqual({ outcome: 'cancelled', endedAt: START + 61_900, actualFocusS: 61 });
  });

  it('caps a late cancel at the planned duration', () => {
    expect(cancelledEnding(aSession(), START + 9_999_999).actualFocusS).toBe(1500);
  });

  it('does not end a cancelled session before it started', () => {
    const ending = cancelledEnding(aSession(), START - 10_000);
    expect(ending.endedAt).toBe(START);
    expect(ending.actualFocusS).toBe(0);
  });
});

describe('resumeVerdict', () => {
  it('reports a session still running with its remaining time', () => {
    expect(resumeVerdict(aSession(), START + 60_000)).toEqual({
      kind: 'running',
      remainingMs: 1_440_000,
    });
  });

  // The detail that matters: a session that ended while the app was quit
  // ended at its planned end, not when the app was reopened.
  it('dates a session that finished while away to its planned end, not to now', () => {
    const reopenedAt = START + 1_500_000 + 3 * 3_600_000;
    expect(resumeVerdict(aSession(), reopenedAt)).toEqual({
      kind: 'completed',
      endedAt: START + 1_500_000,
      actualFocusS: 1500,
    });
  });
});

describe('durations', () => {
  it.each([
    [25, 25],
    [3, 5],
    [7, 5],
    [8, 10],
    [181, 180],
    [999, 180],
    [-20, 5],
  ])('snaps %d minutes to %d', (input, expected) => {
    expect(clampCustomMinutes(input)).toBe(expected);
  });

  it('falls back to the default for non-numbers', () => {
    expect(clampCustomMinutes(Number.NaN)).toBe(DEFAULT_MINUTES);
    expect(clampCustomMinutes(Number.POSITIVE_INFINITY)).toBe(DEFAULT_MINUTES);
  });
});

describe('formatRemaining', () => {
  it.each([
    [1_500_000, '25:00'],
    [1_499_001, '25:00'],
    [1_499_000, '24:59'],
    [59_000, '00:59'],
    [1, '00:01'],
    [0, '00:00'],
    [-5_000, '00:00'],
    [3_600_000, '1:00:00'],
    [5_400_000, '1:30:00'],
    [10_800_000, '3:00:00'],
  ])('formats %d ms as %s', (ms, expected) => {
    expect(formatRemaining(ms)).toBe(expected);
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '0 seconds'],
    [1, '1 second'],
    [59, '59 seconds'],
    [60, '1 minute'],
    [1500, '25 minutes'],
    [3600, '1 h'],
    [5400, '1 h 30 min'],
  ])('formats %d s as %s', (s, expected) => {
    expect(formatDuration(s)).toBe(expected);
  });
});
