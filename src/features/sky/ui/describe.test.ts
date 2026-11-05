import { describe, expect, it } from 'vitest';

import { deriveSky } from '../domain/derive';
import { deriveShared } from '../domain/shared';
import { tierRules } from '../domain/tiers';
import type { CompletedSession, ConstellationChoice } from '../domain/types';
import {
  figureCaption,
  focusLabel,
  minimumLabel,
  progressLabel,
  starLabel,
  wanderingStarLabel,
} from './describe';

const T0 = 1_700_000_000_000;
const rules = tierRules(false);

const star = (i: number, focusMin = 25): CompletedSession => ({
  id: `s${i}`,
  seed: `seed-${i}`,
  startedAt: T0 + i * 3_600_000 - focusMin * 60_000,
  endedAt: T0 + i * 3_600_000,
  actualFocusS: focusMin * 60,
});

const kite: ConstellationChoice = {
  id: 'c-kite',
  source: 'catalogue',
  shapeId: 'kite',
  seed: null,
  tier: 'easy',
  chosenAt: T0 - 1,
};

/** The Kite has four stars. */
const solo = (stars: number) =>
  deriveSky(
    Array.from({ length: stars }, (_, i) => star(i + 1)),
    [kite],
    rules,
  ).constellations[0]!;

const shared = (stars: number, over: { stoppedAt?: number | null } = {}) =>
  deriveShared({
    id: 'sh1',
    partnerName: 'Bea',
    choice: kite,
    starsNeeded: 4,
    minFocusS: 0,
    acceptedAt: T0,
    stoppedAt: over.stoppedAt ?? null,
    sessions: Array.from({ length: stars }, (_, i) => star(i + 1)),
  });

describe('focusLabel', () => {
  it('says minutes under an hour, singular for one', () => {
    expect(focusLabel(60)).toBe('1 minute');
    expect(focusLabel(25 * 60)).toBe('25 minutes');
  });

  it('says hours, with the remaining minutes when there are any', () => {
    expect(focusLabel(60 * 60)).toBe('1 h');
    expect(focusLabel(95 * 60)).toBe('1 h 35 min');
  });
});

describe('minimumLabel', () => {
  it('says "any length" for no minimum', () => {
    expect(minimumLabel(0)).toBe('any length');
    expect(minimumLabel(50 * 60)).toBe('50+ min sessions');
  });
});

describe('starLabel', () => {
  it('names the day and the length of the session', () => {
    // The date part follows the machine's locale, so pin only what is fixed.
    const label = starLabel(T0, 25 * 60);
    expect(label.startsWith('Star from ')).toBe(true);
    expect(label.endsWith(', 25 minutes')).toBe(true);
  });
});

describe('wanderingStarLabel', () => {
  it('lowercases only the leading "Star", keeping the date exactly as starLabel writes it', () => {
    const plain = starLabel(T0, 25 * 60);
    const label = wanderingStarLabel(T0, 25 * 60);
    expect(label.startsWith('Wandering star from ')).toBe(true);
    // Everything after "Star" (month, day, length) is untouched.
    expect(label).toBe(`Wandering star${plain.slice('Star'.length)}`);
    expect(label.endsWith(', 25 minutes')).toBe(true);
    const month = new Date(T0).toLocaleDateString(undefined, { month: 'short' });
    expect(label).toContain(month);
  });
});

describe('progressLabel', () => {
  it('counts stars while a constellation is being built', () => {
    expect(progressLabel(solo(3))).toBe('The Kite, 3 of 4 stars');
  });

  it('says complete once it is full', () => {
    expect(progressLabel(solo(4))).toBe('The Kite, complete');
  });

  it('says unfinished when a later choice superseded it', () => {
    const next: ConstellationChoice = { ...kite, id: 'c-two', chosenAt: T0 + 10 * 3_600_000 };
    const first = deriveSky([star(1), star(2)], [kite, next], rules).constellations[0]!;
    expect(progressLabel(first)).toBe('The Kite, 2 of 4 stars, unfinished');
  });

  it('names the friend on a shared constellation', () => {
    expect(progressLabel(shared(1))).toBe('The Kite with Bea, 1 of 4 stars');
    expect(progressLabel(shared(4))).toBe('The Kite with Bea, complete');
  });

  it('says stopped on a shared constellation that was stopped early', () => {
    expect(progressLabel(shared(1, { stoppedAt: T0 + 5 * 3_600_000 }))).toBe(
      'The Kite with Bea, 1 of 4 stars, stopped',
    );
  });
});

describe('figureCaption', () => {
  it('shows progress under an unfinished constellation, and only the name once done', () => {
    expect(figureCaption(solo(3))).toBe('The Kite · 3/4');
    expect(figureCaption(solo(4))).toBe('The Kite');
  });

  // e2e/web/shared.spec.ts finds these captions by their exact words.
  it('says who a shared constellation is with, and how far it has got', () => {
    expect(figureCaption(shared(1))).toBe('The Kite · with Bea · 1/4');
    expect(figureCaption(shared(4))).toBe('The Kite · with Bea');
    expect(figureCaption(shared(1, { stoppedAt: T0 + 5 * 3_600_000 }))).toBe(
      'The Kite · with Bea · stopped',
    );
  });
});
