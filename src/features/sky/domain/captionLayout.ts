/**
 * How a constellation's caption sits under its figure: how bright it is, and
 * how it breaks into lines when its cell is too narrow to hold it on one.
 * Pure, so the rules are testable without a browser's text metrics; the
 * component measures what it drew and walks these candidates until one fits.
 */

/**
 * A caption's opacity, whatever state its figure is in. Lavender-300 over
 * night-900 at 0.75 is 6.4:1 (WCAG AA needs 4.5:1), so a caption stays
 * readable on an unfinished or dimmed figure: only the lines and stars fade.
 */
export const CAPTION_ALPHA = 0.75;

/** The caption of the figure being looked at is a little brighter. */
export const CAPTION_ALPHA_ACTIVE = 0.9;

/** A caption never shrinks below this, however narrow its cell. */
export const MIN_CAPTION_PX = 10;

/** More lines than this would run into the figure in the next row. */
export const MAX_CAPTION_LINES = 3;

/** Line spacing, in em. */
export const CAPTION_LINE_HEIGHT = 1.15;

const SEPARATOR = ' · ';

/** Join consecutive `parts` into `k` lines so the longest line is as short as can be. */
const groupParts = (parts: readonly string[], k: number): string[] => {
  let best: string[] = [parts.join(SEPARATOR)];
  let bestLongest = Infinity;
  const walk = (start: number, left: number, acc: readonly string[]): void => {
    if (left === 1) {
      const lines = [...acc, parts.slice(start).join(SEPARATOR)];
      const longest = Math.max(...lines.map((l) => l.length));
      if (longest < bestLongest) {
        bestLongest = longest;
        best = lines;
      }
      return;
    }
    for (let end = start + 1; end <= parts.length - (left - 1); end += 1) {
      walk(end, left - 1, [...acc, parts.slice(start, end).join(SEPARATOR)]);
    }
  };
  walk(0, k, []);
  return best;
};

/** Break the longest line that has a space at the space nearest its middle. */
const splitLongest = (lines: readonly string[]): string[] | null => {
  const byLength = lines
    .map((line, i) => ({ line, i }))
    .sort((a, b) => b.line.length - a.line.length);
  for (const { line, i } of byLength) {
    const spaces = [...line.matchAll(/ /g)].map((m) => m.index);
    if (spaces.length === 0) continue;
    const middle = line.length / 2;
    const at = spaces.reduce((best, s) =>
      Math.abs(s - middle) < Math.abs(best - middle) ? s : best,
    );
    return [...lines.slice(0, i), line.slice(0, at), line.slice(at + 1), ...lines.slice(i + 1)];
  }
  return null;
};

/**
 * Every way to set `text`, fewest lines first: one line; then broken at the
 * " · " between its parts ("The Kite · with Bea · 1/4"); then, if a part is
 * itself long ("The Gentle Lighthouse"), broken at spaces, up to three lines.
 */
export const captionCandidates = (text: string): string[][] => {
  const parts = text.split(SEPARATOR);
  const candidates: string[][] = [[text]];
  for (let k = 2; k <= Math.min(parts.length, MAX_CAPTION_LINES); k += 1) {
    candidates.push(groupParts(parts, k));
  }
  let last = candidates[candidates.length - 1]!;
  while (last.length < MAX_CAPTION_LINES) {
    const next = splitLongest(last);
    if (next === null) break;
    candidates.push(next);
    last = next;
  }
  return candidates;
};

/**
 * The font size that would make text now `width` wide fit `maxWidth`, never
 * below `MIN_CAPTION_PX`: a caption is cut short by nothing, so a long name is
 * smaller before it is lost. (Letter-spacing is in em, so width scales with size.)
 */
export const shrunkFontSize = (fontSize: number, width: number, maxWidth: number): number =>
  width <= maxWidth ? fontSize : Math.max(MIN_CAPTION_PX, fontSize * (maxWidth / width));
