import { describe, expect, it } from 'vitest';

import { currentStatus, sameStatus, statusLine } from './focusStatus';

const NOW = 1_800_000_000_000;
const MIN = 60_000;

describe('currentStatus', () => {
  it('is nothing when idle', () => {
    expect(currentStatus({ session: null, runBreak: null }, NOW)).toBeNull();
  });

  it('is a focus block until the session’s planned end (countdown or Pomodoro block alike)', () => {
    const session = { startedAt: NOW - 5 * MIN, plannedDurationS: 25 * 60, endedAt: null };
    expect(currentStatus({ session, runBreak: null }, NOW)).toEqual({
      kind: 'focus',
      startedAt: NOW - 5 * MIN,
      until: NOW + 20 * MIN,
    });
  });

  it('is nothing once the session has ended, or its planned end has passed', () => {
    const ended = { startedAt: NOW - 30 * MIN, plannedDurationS: 25 * 60, endedAt: NOW - 5 * MIN };
    expect(currentStatus({ session: ended, runBreak: null }, NOW)).toBeNull();
    const late = { startedAt: NOW - 30 * MIN, plannedDurationS: 25 * 60, endedAt: null };
    expect(currentStatus({ session: late, runBreak: null }, NOW)).toBeNull();
  });

  it('is a break until the break ends', () => {
    const runBreak = { startedAt: NOW - 2 * MIN, durationS: 5 * 60 };
    expect(currentStatus({ session: null, runBreak }, NOW)).toEqual({
      kind: 'break',
      startedAt: NOW - 2 * MIN,
      until: NOW + 3 * MIN,
    });
  });

  it('is nothing once the break is over and the next block hasn’t started', () => {
    const runBreak = { startedAt: NOW - 10 * MIN, durationS: 5 * 60 };
    expect(currentStatus({ session: null, runBreak }, NOW)).toBeNull();
  });
});

describe('sameStatus', () => {
  const a = { kind: 'focus' as const, startedAt: 1, until: 2 };
  it('compares what friends would see', () => {
    expect(sameStatus(null, null)).toBe(true);
    expect(sameStatus(a, { ...a })).toBe(true);
    expect(sameStatus(a, null)).toBe(false);
    expect(sameStatus(a, { ...a, kind: 'break' })).toBe(false);
    expect(sameStatus(a, { ...a, until: 3 })).toBe(false);
  });
});

describe('statusLine', () => {
  it('says what and how long, rounding up', () => {
    expect(statusLine({ kind: 'focus', startedAt: NOW, until: NOW + 18 * MIN }, NOW)).toBe(
      'Focusing now · 18 min left',
    );
    expect(statusLine({ kind: 'break', startedAt: NOW, until: NOW + 2 * MIN + 1 }, NOW)).toBe(
      'On a break · 3 min left',
    );
    expect(statusLine({ kind: 'focus', startedAt: NOW, until: NOW + 10_000 }, NOW)).toBe(
      'Focusing now · 1 min left',
    );
  });

  it('is nothing when there’s no status, or it has run out', () => {
    expect(statusLine(null, NOW)).toBeNull();
    expect(statusLine({ kind: 'focus', startedAt: NOW - MIN, until: NOW }, NOW)).toBeNull();
  });
});
