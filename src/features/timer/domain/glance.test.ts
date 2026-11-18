import { describe, expect, it } from 'vitest';

import { timerGlance } from './glance';
import type { ActiveSession, PomodoroRun } from './types';

const START = 1_000_000;
const session = (plannedMin: number): ActiveSession => ({
  id: 's',
  mode: 'countdown',
  runId: null,
  runIndex: null,
  startedAt: START,
  plannedDurationS: plannedMin * 60,
  seed: 'x',
  tagId: null,
  device: 'd',
  awayMs: 0,
  togetherId: null,
  sharedId: null,
});

const runOnBreak = (minutes: number): PomodoroRun =>
  ({
    id: 'r',
    startedAt: START,
    blocksDone: 1,
    break: { kind: 'short', startedAt: START, durationS: minutes * 60 },
  }) as PomodoroRun;

describe('timerGlance', () => {
  it('says nothing when idle or loading', () => {
    expect(timerGlance('idle', null, null, START)).toBeNull();
    expect(timerGlance('loading', null, null, START)).toBeNull();
  });

  it('counts whole minutes left, rounded up', () => {
    expect(timerGlance('running', session(25), null, START)).toBe('Focusing · 25 min left');
    expect(timerGlance('running', session(25), null, START + 60_000 * 7 + 1)).toBe(
      'Focusing · 18 min left',
    );
  });

  it('never says 0 min left', () => {
    expect(timerGlance('running', session(25), null, START + 25 * 60_000 - 1)).toBe(
      'Focusing · 1 min left',
    );
  });

  it('describes a break, a finished session and a finished run', () => {
    expect(timerGlance('onBreak', null, runOnBreak(5), START + 60_000)).toBe(
      'On a break · 4 min left',
    );
    expect(timerGlance('breakOver', null, null, START)).toBe(
      'Break over · the next block is ready',
    );
    expect(timerGlance('finished', null, null, START)).toBe('Your star is waiting');
    expect(timerGlance('runSummary', null, null, START)).toBe('Your run is complete');
  });
});
