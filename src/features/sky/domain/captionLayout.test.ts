import { describe, expect, it } from 'vitest';

import { LAVENDER_300, NIGHT_900 } from '../../../../design-tokens.mjs';
import {
  CAPTION_ALPHA,
  CAPTION_ALPHA_ACTIVE,
  MAX_CAPTION_LINES,
  MIN_CAPTION_PX,
  captionCandidates,
  shrunkFontSize,
} from './captionLayout';

const channels = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const luminance = ([r, g, b]: readonly number[]): number => {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!);
};

/** WCAG contrast of `fg` painted at `alpha` over `bg`. */
const contrast = (fg: string, bg: string, alpha: number): number => {
  const f = channels(fg);
  const b = channels(bg);
  const mixed = f.map((v, i) => v * alpha + b[i]! * (1 - alpha));
  const [hi, lo] = [luminance(mixed), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

describe('caption brightness', () => {
  it('is readable (WCAG AA, 4.5:1) over the night ground at both opacities', () => {
    expect(contrast(LAVENDER_300, NIGHT_900, CAPTION_ALPHA)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(LAVENDER_300, NIGHT_900, CAPTION_ALPHA_ACTIVE)).toBeGreaterThanOrEqual(4.5);
  });

  it('would not have been, at the old stacked opacity of an unfinished, dimmed figure', () => {
    // 0.75 (caption) x 0.45 (unfinished) x 0.35 (another figure looked at).
    expect(contrast(LAVENDER_300, NIGHT_900, 0.75 * 0.45 * 0.35)).toBeLessThan(4.5);
  });
});

describe('captionCandidates', () => {
  it('starts with the text on one line', () => {
    expect(captionCandidates('The Kite')[0]).toEqual(['The Kite']);
  });

  it('breaks a shared figure’s caption at the dots, keeping the shorter part together', () => {
    const two = captionCandidates('The Kite · with Bea · 1/4')[1];
    expect(two).toEqual(['The Kite', 'with Bea · 1/4']);
    expect(captionCandidates('The Kite · with Bea · 1/4')[2]).toEqual([
      'The Kite',
      'with Bea',
      '1/4',
    ]);
  });

  it('breaks a long name at its spaces when the dots are not enough', () => {
    const all = captionCandidates('The Gentle Lighthouse · 2/7');
    expect(all[1]).toEqual(['The Gentle Lighthouse', '2/7']);
    expect(all.at(-1)).toEqual(['The Gentle', 'Lighthouse', '2/7']);
  });

  it('never offers more than the line limit, and leaves a one-word caption whole', () => {
    for (const lines of captionCandidates('The Sleeping Feather · with Bea · 12/20')) {
      expect(lines.length).toBeLessThanOrEqual(MAX_CAPTION_LINES);
    }
    expect(captionCandidates('Kite')).toEqual([['Kite']]);
  });

  it('loses no words', () => {
    const text = 'The Hushed Lighthouse · with Bea · 3/7';
    for (const lines of captionCandidates(text)) {
      expect(lines.join(' ').replace(/ · /g, ' ').replace(/ +/g, ' ')).toBe(
        text.replace(/ · /g, ' '),
      );
    }
  });
});

describe('shrunkFontSize', () => {
  it('leaves a caption that fits alone', () => {
    expect(shrunkFontSize(11, 80, 100)).toBe(11);
  });

  it('scales a caption down to fit, but not below the floor', () => {
    expect(shrunkFontSize(12, 120, 100)).toBeCloseTo(10);
    expect(shrunkFontSize(14, 140, 105)).toBeCloseTo(10.5);
    expect(shrunkFontSize(11, 400, 100)).toBe(MIN_CAPTION_PX);
  });
});
