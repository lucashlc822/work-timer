// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PackPreview } from './PackPreview';
import { StylePreview } from './StylePreview';
import { ThemeSwatch } from './ThemeSwatch';

afterEach(cleanup);

describe('the shop previews at card size', () => {
  it('a style preview is 40 px by default and scales the same star when asked for more', () => {
    const small = render(<StylePreview styleKey="ember" />).container.querySelector('svg')!;
    expect(small.getAttribute('width')).toBe('40');
    expect(small.getAttribute('viewBox')).toBe('0 0 40 40');
    cleanup();

    const big = render(<StylePreview styleKey="ember" size={72} />).container.querySelector('svg')!;
    expect(big.getAttribute('width')).toBe('72');
    expect(big.getAttribute('height')).toBe('72');
    // Same drawing, scaled: the viewBox is unchanged.
    expect(big.getAttribute('viewBox')).toBe('0 0 40 40');
  });

  it('a theme swatch is a plain chip by default and a sky with stars at card size', () => {
    const chip = render(<ThemeSwatch theme="dusk" />).container;
    expect(chip.querySelector('svg')).toBeNull();
    expect(chip.querySelector('span')?.className).toContain('h-10');
    cleanup();

    const sky = render(<ThemeSwatch theme="dusk" size="card" />).container;
    expect(sky.querySelectorAll('circle').length).toBeGreaterThanOrEqual(10);
    expect(sky.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
  });

  it('card-size stars take the theme’s own tints, and night falls back to the star tokens', () => {
    const fills = (theme: string) => {
      const out = render(<ThemeSwatch theme={theme} size="card" />).container;
      const set = new Set([...out.querySelectorAll('circle')].map((c) => c.getAttribute('fill')));
      cleanup();
      return set;
    };
    expect(fills('dusk').has('#ffd2a0')).toBe(true); // dusk's warm tint
    expect(fills('tide').has('#c4e4ff')).toBe(true); // tide's cool tint
    expect(fills('night').has('#d6e8ff')).toBe(true); // night: STAR_COOL
  });

  it('a pack preview keeps its tooltips by default and writes the names out when labelled', () => {
    const plain = render(<PackPreview pack="woodland" />).container;
    expect(plain.querySelectorAll('[title]')).toHaveLength(3);
    expect(screen.queryByText('The Fox')).toBeNull();
    cleanup();

    render(<PackPreview pack="woodland" labelled />);
    for (const name of ['The Fox', 'The Owl', 'The Stag']) {
      expect(screen.getByText(name)).toBeTruthy();
    }
    expect(screen.getByText('easy')).toBeTruthy();
    expect(screen.getByText('medium')).toBeTruthy();
    expect(screen.getByText('hard')).toBeTruthy();
  });
});
