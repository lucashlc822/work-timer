import { describe, expect, it } from 'vitest';

import { deriveSky } from '../domain/derive';
import { deriveShared } from '../domain/shared';
import { tierRules } from '../domain/tiers';
import type { CompletedSession, ConstellationChoice } from '../domain/types';
import {
  cardDate,
  constellationCardModel,
  constellationDescription,
  contextLines,
  figureCaption,
  focusLabel,
  listNames,
  minimumLabel,
  progressLabel,
  starCardModel,
  starDescription,
  starLabel,
  wanderingStarLabel,
  timeRange,
  type CardFacts,
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

describe('the star card words', () => {
  const NOV_2 = new Date(2026, 10, 2, 21, 40).getTime();

  it('dates a card by its start, adding the year only when it is not this one', () => {
    const thisYear = cardDate(NOV_2, new Date(2026, 11, 31).getTime());
    const lastYear = cardDate(NOV_2, new Date(2027, 0, 1).getTime());
    expect(thisYear).not.toContain('2026');
    expect(lastYear).toContain('2026');
  });

  it('shows the start and end time, in the reader’s own clock style', () => {
    const end = NOV_2 + 25 * 60_000;
    const range = timeRange(NOV_2, end);
    const clock = (ms: number) =>
      new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    expect(range).toBe(`${clock(NOV_2)}–${clock(end)}`);
  });

  it('runs a session over midnight from one day into the next', () => {
    const start = new Date(2026, 10, 2, 23, 40).getTime();
    const end = new Date(2026, 10, 3, 0, 5).getTime();
    const [from, to] = timeRange(start, end).split('–');
    expect(from).toMatch(/40/);
    expect(to).toMatch(/05/);
  });

  it('lists names the way a person would', () => {
    expect(listNames(['mia'])).toBe('mia');
    expect(listNames(['mia', 'Bea'])).toBe('mia and Bea');
    expect(listNames(['mia', 'Bea', 'Kai'])).toBe('mia, Bea and Kai');
  });

  const none: CardFacts = { tag: null, run: null, together: null, partnerName: null };

  it('says nothing more for a plain solo session', () => {
    expect(contextLines(none)).toEqual([]);
  });

  it('places a Pomodoro block in its run, or just numbers it while the run is going', () => {
    expect(contextLines({ ...none, run: { index: 2, total: 3 } })).toEqual([
      'Pomodoro block 2 of 3',
    ]);
    expect(contextLines({ ...none, run: { index: 2, total: null } })).toEqual(['Pomodoro block 2']);
  });

  it('names who you focused with, or says only that you did when this device never knew', () => {
    expect(contextLines({ ...none, together: { names: ['mia', 'Bea'] } })).toEqual([
      'Focused with mia and Bea',
    ]);
    expect(contextLines({ ...none, together: { names: null } })).toEqual(['Focused together']);
    expect(contextLines({ ...none, together: { names: [] } })).toEqual(['Focused together']);
  });

  it('calls a friend’s star theirs and says nothing else about it', () => {
    expect(contextLines({ ...none, partnerName: 'Bea', run: { index: 1, total: 1 } })).toEqual([
      'Bea’s star',
    ]);
  });

  it('puts the whole card into one sentence for a screen reader', () => {
    const model = starCardModel(
      { startedAt: NOV_2, endedAt: NOV_2 + 25 * 60_000, actualFocusS: 25 * 60 },
      { ...none, tag: { name: 'Writing', color: 'mint' }, run: { index: 2, total: 3 } },
      'Ember',
      NOV_2,
    );
    expect(model.duration).toBe('25 minutes');
    expect(model.styleName).toBe('Ember');

    const sentence = starDescription(model);
    expect(sentence.startsWith(`${model.date}, ${model.time}, 25 minutes.`)).toBe(true);
    expect(sentence).toContain('Tagged Writing.');
    expect(sentence).toContain('Pomodoro block 2 of 3.');
    expect(sentence.endsWith('Ember star.')).toBe(true);
  });
});

describe('the constellation card words', () => {
  const NOW = T0 + 40 * 3_600_000;

  it('counts stars, says when it began and how much focus it holds', () => {
    const m = constellationCardModel(solo(3), NOW);
    expect(m.name).toBe('The Kite');
    expect(m.progress).toBe('3 of 4 stars');
    expect(m.started).toBe(`Started ${cardDate(kite.chosenAt, NOW)}`);
    expect(m.totalFocus).toBe('1 h 15 min of focus');
  });

  it('says when a finished one was completed', () => {
    const done = solo(4);
    expect(constellationCardModel(done, NOW).progress).toBe(
      `Complete on ${cardDate(done.completedAt!, NOW)}`,
    );
  });

  it('marks one left unfinished, and says so when it has no stars', () => {
    const next: ConstellationChoice = { ...kite, id: 'c-two', chosenAt: T0 + 10 * 3_600_000 };
    const first = deriveSky([star(1), star(2)], [kite, next], rules).constellations;
    expect(constellationCardModel(first[0]!, NOW).progress).toBe('2 of 4 stars · unfinished');
    expect(constellationCardModel(first[1]!, NOW).totalFocus).toBe('No stars yet');
  });

  it('names the friend on a shared one, counts toward what it needs, and says when it stopped', () => {
    expect(constellationCardModel(shared(1), NOW).name).toBe('The Kite with Bea');
    expect(constellationCardModel(shared(1), NOW).progress).toBe('1 of 4 stars');
    expect(constellationCardModel(shared(1, { stoppedAt: T0 + 5 * 3_600_000 }), NOW).progress).toBe(
      '1 of 4 stars · stopped',
    );
  });

  it('puts the card into one sentence for a screen reader', () => {
    const m = constellationCardModel(solo(3), NOW);
    expect(constellationDescription(m)).toBe(`3 of 4 stars. ${m.started}. 1 h 15 min of focus.`);
  });
});
