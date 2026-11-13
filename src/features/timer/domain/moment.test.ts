import { describe, expect, it } from 'vitest';

import { CHIME_WINDOW_MS, MOMENT_TIMELINE, reached, shouldChime, stageAt } from './moment';

describe('the completion moment timeline', () => {
  it('walks a full moment through every stage in order', () => {
    expect(stageAt('full', 0)).toBe('ignite');
    expect(stageAt('full', 899)).toBe('ignite');
    expect(stageAt('full', 900)).toBe('arrive');
    expect(stageAt('full', 1500)).toBe('tally');
    expect(stageAt('full', 2999)).toBe('tally');
    expect(stageAt('full', 3000)).toBe('settled');
    expect(stageAt('full', 60_000)).toBe('settled');
  });

  it('gives a light moment no tally, and ends it sooner', () => {
    const stages = MOMENT_TIMELINE.light.map((s) => s.stage);
    expect(stages).not.toContain('tally');
    expect(stageAt('light', 700)).toBe('arrive');
    expect(stageAt('light', 1600)).toBe('settled');
  });

  it('treats time before the start as the start', () => {
    expect(stageAt('full', -50)).toBe('ignite');
  });

  it('keeps every timeline in time order, ending on settled', () => {
    for (const steps of Object.values(MOMENT_TIMELINE)) {
      const times = steps.map((s) => s.atMs);
      expect(times).toEqual([...times].sort((a, b) => a - b));
      expect(steps.at(-1)?.stage).toBe('settled');
    }
  });

  it('counts a stage as reached once the moment is at or past it', () => {
    expect(reached('waiting', 'ignite')).toBe(false);
    expect(reached('ignite', 'ignite')).toBe(true);
    expect(reached('arrive', 'tally')).toBe(false);
    // A light moment skips tally: settled has still reached it.
    expect(reached('settled', 'tally')).toBe(true);
  });
});

describe('when the moment chimes', () => {
  it('chimes for a moment that starts as the session ends, not long after', () => {
    expect(shouldChime(1_000, 1_050)).toBe(true);
    expect(shouldChime(1_000, 1_000 + CHIME_WINDOW_MS)).toBe(true);
    expect(shouldChime(1_000, 1_001 + CHIME_WINDOW_MS)).toBe(false);
  });
});
