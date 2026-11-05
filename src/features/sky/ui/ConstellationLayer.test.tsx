// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { deriveSky } from '../domain/derive';
import { tierRules } from '../domain/tiers';
import type { CompletedSession, ConstellationChoice } from '../domain/types';
import { ConstellationLayer } from './ConstellationLayer';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const T0 = 1_700_000_000_000;
const HOUR = 3_600_000;

const star = (i: number, endedAt = T0 + i * HOUR): CompletedSession => ({
  id: `s${i}`,
  seed: `seed-${i}`,
  startedAt: endedAt - 25 * 60_000,
  endedAt,
  actualFocusS: 25 * 60,
});

const choice = (id: string, shapeId: string, chosenAt: number): ConstellationChoice => ({
  id,
  source: 'catalogue',
  shapeId,
  seed: null,
  tier: 'easy',
  chosenAt,
});

const rules = tierRules(false);

/** A finished Kite (4 stars), then an Arrow with 2 of its 5, then nothing wandering. */
const sky = () =>
  deriveSky(
    [star(1), star(2), star(3), star(4), star(12), star(13)],
    [choice('c1', 'kite', T0), choice('c2', 'arrow', T0 + 10 * HOUR)],
    rules,
  );

/** Six constellations with a star each, so the full sky lays out in several columns. */
const crowdedSky = () => {
  const shapes = ['kite', 'arrow', 'teacup', 'lantern', 'swan', 'harp'];
  return deriveSky(
    shapes.map((_, i) => star(100 + i, T0 + (i * 10 + 5) * HOUR)),
    shapes.map((shape, i) => choice(`k${i}`, shape, T0 + i * 10 * HOUR)),
    rules,
  );
};

const renderLayer = (mode: 'hero' | 'full', state = sky(), width = 1200) =>
  render(<ConstellationLayer sky={state} mode={mode} width={width} height={800} />);

describe('ConstellationLayer', () => {
  it('in full mode, is a labelled group holding every earned star as a focusable image', () => {
    const { container } = renderLayer('full');

    const root = container.querySelector('svg')!;
    expect(root.getAttribute('role')).toBe('group');
    expect(root.getAttribute('aria-label')).toBe('Your sky');
    expect(root.hasAttribute('aria-hidden')).toBe(false);

    const stars = [...container.querySelectorAll('[role="img"][tabindex="0"]')];
    expect(stars).toHaveLength(6);
    for (const s of stars)
      expect(s.getAttribute('aria-label')).toMatch(/^Star from .+, 25 minutes$/);
  });

  it('in full mode, labels each figure with its progress and captions it', () => {
    const { container } = renderLayer('full');

    const groups = [...container.querySelectorAll('g[role="group"]')].map((g) =>
      g.getAttribute('aria-label'),
    );
    expect(groups).toEqual(['The Kite, complete', 'The Arrow, 2 of 5 stars']);

    const captions = [...container.querySelectorAll('text')].map((t) => t.textContent);
    expect(captions).toEqual(['The Kite', 'The Arrow · 2/5']);
  });

  it('draws one line per earned edge, and the rest as faint dashes', () => {
    const { container } = renderLayer('full');

    // Kite is complete: its 4 edges are all earned. Arrow has earned 1 of its edges.
    const dashed = container.querySelectorAll('line[stroke-dasharray]');
    expect(dashed.length).toBeGreaterThan(0);
    const solid = [...container.querySelectorAll('line')].filter(
      (l) => !l.hasAttribute('stroke-dasharray') && l.getAttribute('stroke-width') !== null,
    );
    expect(solid.length).toBeGreaterThanOrEqual(5);
  });

  it('in hero mode, is decorative: hidden from assistive tech and not focusable', () => {
    const { container } = renderLayer('hero');

    expect(container.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('[tabindex]')).toBeNull();
    expect(container.querySelector('[role="img"]')).toBeNull();
  });

  it('in hero mode, shows only the constellation being built', () => {
    const { container } = renderLayer('hero');
    expect(container.querySelectorAll('text')).toHaveLength(0);
    // Two earned stars of the Arrow, each with a body circle (plus halo and core).
    expect(container.querySelectorAll('circle').length).toBeGreaterThanOrEqual(2);
  });

  it('hides an abandoned constellation that never got a star', () => {
    const state = deriveSky(
      [star(1), star(2), star(3), star(4)],
      [choice('c0', 'teacup', T0 - 3 * HOUR), choice('c1', 'kite', T0)],
      rules,
    );
    const { container } = renderLayer('full', state);

    const labels = [...container.querySelectorAll('g[role="group"]')].map((g) =>
      g.getAttribute('aria-label'),
    );
    expect(labels).toEqual(['The Kite, complete']);
  });

  describe('captions at the window edge', () => {
    // jsdom has no text metrics, so give every caption a width to measure.
    const withTextLength = (length: number) => {
      Object.defineProperty(SVGElement.prototype, 'getComputedTextLength', {
        configurable: true,
        value: () => length,
      });
    };
    afterEach(() => {
      Reflect.deleteProperty(SVGElement.prototype, 'getComputedTextLength');
    });

    const captionXs = (container: HTMLElement) =>
      [...container.querySelectorAll('text')].map((t) => Number(t.getAttribute('x')));

    it('pulls a caption wider than its room back inside the window, 8 px from each edge', () => {
      const natural = captionXs(renderLayer('full', crowdedSky(), 480).container);
      cleanup();
      withTextLength(300);
      const clamped = captionXs(renderLayer('full', crowdedSky(), 480).container);

      expect(clamped.length).toBe(6);
      // Some caption was too wide where its figure put it, so something had to move.
      expect(clamped).not.toEqual(natural);
      for (const x of clamped) {
        expect(x - 150).toBeGreaterThanOrEqual(8);
        expect(x + 150).toBeLessThanOrEqual(480 - 8);
      }
    });

    it('leaves captions that already fit exactly where the figure puts them', () => {
      withTextLength(20);
      const measured = captionXs(renderLayer('full', crowdedSky(), 480).container);
      cleanup();
      Reflect.deleteProperty(SVGElement.prototype, 'getComputedTextLength');
      const unmeasured = captionXs(renderLayer('full', crowdedSky(), 480).container);

      expect(measured).toEqual(unmeasured);
    });

    it('keeps a caption centred when it is wider than the whole window', () => {
      withTextLength(900);
      const clamped = captionXs(renderLayer('full', crowdedSky(), 480).container);
      cleanup();
      Reflect.deleteProperty(SVGElement.prototype, 'getComputedTextLength');
      const natural = captionXs(renderLayer('full', crowdedSky(), 480).container);

      expect(clamped).toEqual(natural);
    });
  });
});
