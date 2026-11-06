// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { STAR_FORMS } from '../domain/starForm';
import { STAR_STYLE_KEYS } from '../domain/starStyles';
import { StylePreview } from './StylePreview';

afterEach(cleanup);

const paths = (key: string) => {
  const { container } = render(<StylePreview styleKey={key} />);
  return [...container.querySelectorAll('path')];
};

describe('the shop style preview', () => {
  it('draws every style as the sky does: spike counts match the style recipe', () => {
    for (const key of STAR_STYLE_KEYS) {
      const { container } = render(<StylePreview styleKey={key} />);
      const svg = container.querySelector('svg')!;
      expect(svg.getAttribute('data-style')).toBe(key);
      // Spikes are grouped by colour into paths, so count diamonds by their "M" commands.
      const diamonds = [...container.querySelectorAll('path')].reduce(
        (n, p) => n + (p.getAttribute('d')!.match(/M/g) ?? []).length,
        0,
      );
      expect(diamonds).toBe(STAR_FORMS[key]?.spikes.length ?? 4);
      cleanup();
    }
  });

  it('gives each style a different picture, so the buyer can tell them apart', () => {
    const pictures = STAR_STYLE_KEYS.map((key) => {
      const { container } = render(<StylePreview styleKey={key} />);
      const html = container.innerHTML.replace(/style-[^"')]+/g, 'ID');
      cleanup();
      return html;
    });
    expect(new Set(pictures).size).toBe(STAR_STYLE_KEYS.length);
  });

  it('has no filter anywhere, is decorative, and does not twinkle', () => {
    for (const key of STAR_STYLE_KEYS) {
      const { container } = render(<StylePreview styleKey={key} />);
      expect(container.querySelector('[filter]')).toBeNull();
      expect(container.querySelector('filter')).toBeNull();
      expect(container.querySelector('.sky-twinkle')).toBeNull();
      expect(container.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
      cleanup();
    }
  });

  it('keeps every spike inside a generous box, so nothing is cut off in a shop row', () => {
    for (const key of STAR_STYLE_KEYS) {
      for (const d of paths(key).map((p) => p.getAttribute('d')!)) {
        for (const n of d.match(/-?\d+(\.\d+)?/g)!.map(Number)) {
          expect(n).toBeGreaterThanOrEqual(-4);
          expect(n).toBeLessThanOrEqual(44);
        }
      }
      cleanup();
    }
  });

  it('draws an unknown style as classic, like the sky', () => {
    const strip = (html: string) =>
      html.replace(/style-[^"')]+/g, 'ID').replace(/data-style="[^"]*"/, '');
    const unknown = strip(render(<StylePreview styleKey="from-the-future" />).container.innerHTML);
    cleanup();
    const classic = strip(render(<StylePreview styleKey="classic" />).container.innerHTML);
    expect(unknown).toBe(classic);
  });

  it('gives two previews on one page different gradient ids', () => {
    const { container } = render(
      <>
        <StylePreview styleKey="ember" />
        <StylePreview styleKey="ember" />
      </>,
    );
    const ids = [...container.querySelectorAll('radialGradient')].map((g) => g.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});
