import type { TagColor } from '@/shared/db';

import { isShared } from '../domain/shared';
import type { CompletedSession, ConstellationState } from '../domain/types';

/**
 * Words for screen readers and tooltips. Kept inside the sky feature rather
 * than borrowed from the timer's formatters, because features stay opaque to
 * each other.
 */

export const focusLabel = (seconds: number): string => {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return minutes === 1 ? '1 minute' : `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
};

export const minimumLabel = (minSessionS: number): string =>
  minSessionS === 0 ? 'any length' : `${Math.round(minSessionS / 60)}+ min sessions`;

export const starLabel = (endedAt: number, focusS: number): string =>
  `Star from ${new Date(endedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${focusLabel(focusS)}`;

/**
 * `starLabel` for a star that belongs to no constellation. Only the leading
 * "Star" is lowercased: lowercasing the whole label would also flatten the
 * locale's month ("nov 3"), which a screen reader then mispronounces.
 */
export const wanderingStarLabel = (endedAt: number, focusS: number): string =>
  `Wandering star${starLabel(endedAt, focusS).slice('Star'.length)}`;

export const progressLabel = (c: ConstellationState): string => {
  if (isShared(c)) {
    const name = `${c.def.name} with ${c.partnerName}`;
    if (c.complete) return `${name}, complete`;
    const stopped = c.status === 'stopped' ? ', stopped' : '';
    return `${name}, ${c.stars.length} of ${c.starsNeeded} stars${stopped}`;
  }
  const total = c.def.shape.points.length;
  if (c.complete) return `${c.def.name}, complete`;
  const state = c.abandoned ? ', unfinished' : '';
  return `${c.def.name}, ${c.stars.length} of ${total} stars${state}`;
};

/** The words under a figure in the full sky: "Swan · with Ada · 3/7". */
export const figureCaption = (c: ConstellationState): string => {
  if (!isShared(c)) {
    return c.complete
      ? c.def.name
      : `${c.def.name} · ${c.stars.length}/${c.def.shape.points.length}`;
  }
  const base = `${c.def.name} · with ${c.partnerName}`;
  if (c.complete) return base;
  if (c.status === 'stopped') return `${base} · stopped`;
  return `${base} · ${c.stars.length}/${c.starsNeeded}`;
};

// --- The star card (View sky upgrade PR 3) ------------------------------------

/** "Mon 2 Nov", with the year only when it isn't this year's. By the session's start. */
export const cardDate = (startedAt: number, now: number): string => {
  const start = new Date(startedAt);
  const sameYear = start.getFullYear() === new Date(now).getFullYear();
  return start.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
};

const clockTime = (ms: number): string =>
  new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** "21:40–22:05", in the reader's own clock style. A session over midnight reads "23:40–00:05". */
export const timeRange = (startedAt: number, endedAt: number): string =>
  `${clockTime(startedAt)}–${clockTime(endedAt)}`;

/** "mia", "mia and Bea", "mia, Bea and Kai". */
export const listNames = (names: readonly string[]): string =>
  names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/** What the card knows about a star beyond its time, as plain values. */
export interface CardFacts {
  tag: { name: string; color: TagColor } | null;
  run: { index: number; total: number | null } | null;
  together: { names: readonly string[] | null } | null;
  /** Set when the star is your friend's, in a constellation you share. */
  partnerName: string | null;
}

/** The lines under the time: whose star, who you were with, which Pomodoro block. */
export const contextLines = (facts: CardFacts): string[] => {
  if (facts.partnerName !== null) return [`${facts.partnerName}’s star`];
  const lines: string[] = [];
  if (facts.together !== null) {
    const names = facts.together.names ?? [];
    lines.push(names.length > 0 ? `Focused with ${listNames(names)}` : 'Focused together');
  }
  if (facts.run !== null) {
    lines.push(
      facts.run.total === null
        ? `Pomodoro block ${facts.run.index}`
        : `Pomodoro block ${facts.run.index} of ${facts.run.total}`,
    );
  }
  return lines;
};

/** Everything the star card shows, already in words. */
export interface StarCardModel {
  date: string;
  time: string;
  duration: string;
  tag: { name: string; color: TagColor } | null;
  context: string[];
  /** "Classic", "Ember", …: the style the star was born with. */
  styleName: string;
}

export const starCardModel = (
  star: Pick<CompletedSession, 'startedAt' | 'endedAt' | 'actualFocusS'>,
  facts: CardFacts,
  styleName: string,
  now: number,
): StarCardModel => ({
  date: cardDate(star.startedAt, now),
  time: timeRange(star.startedAt, star.endedAt),
  duration: focusLabel(star.actualFocusS),
  tag: facts.tag,
  context: contextLines(facts),
  styleName,
});

/**
 * The card as one sentence, for a screen reader: the star's `<desc>`. The
 * visual card is `aria-hidden`, so this is the only way its content is read.
 */
export const starDescription = (m: StarCardModel): string =>
  [
    `${m.date}, ${m.time}, ${m.duration}.`,
    ...(m.tag === null ? [] : [`Tagged ${m.tag.name}.`]),
    ...m.context.map((line) => `${line}.`),
    `${m.styleName} star.`,
  ].join(' ');
