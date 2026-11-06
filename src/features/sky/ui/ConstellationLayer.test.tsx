// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ART_COMPLETE } from '../domain/atlasFade';
import { deriveSky } from '../domain/derive';
import { deriveShared } from '../domain/shared';
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

  describe('stars', () => {
    /** A finished Lantern (a medium tier, so it glows) next to a wandering star. */
    const glowing = () =>
      deriveSky(
        [1, 2, 3, 4, 5, 6, 7].map((i) => star(i)).concat(star(40, T0 + 40 * HOUR)),
        [choice('c-lantern', 'lantern', T0)],
        rules,
      );

    it('draws every earned star with a corona, spikes, a body and a core, and no blur filter', () => {
      const { container } = renderLayer('full');

      const stars = [...container.querySelectorAll('[role="img"][tabindex="0"]')];
      expect(stars).toHaveLength(6);
      for (const s of stars) {
        expect(s.querySelector('ellipse')).not.toBeNull();
        expect(s.querySelectorAll('path').length).toBeGreaterThanOrEqual(1);
        expect(s.querySelectorAll('circle').length).toBeGreaterThanOrEqual(3); // hit area, body, core
        expect(s.querySelector('[filter]')).toBeNull();
      }
    });

    it('blurs the edges of a glowing figure once for the whole figure, not once per line', () => {
      const { container } = renderLayer('full', glowing());

      const filtered = [...container.querySelectorAll('[filter]')];
      expect(filtered).toHaveLength(1);
      expect(filtered[0]!.tagName.toLowerCase()).toBe('g');
      expect(filtered[0]!.querySelectorAll('line').length).toBeGreaterThanOrEqual(3);
      // And never a star.
      expect(container.querySelector('[role="img"] [filter]')).toBeNull();
    });

    it('gives a wandering star the same treatment, with no filter', () => {
      const { container } = renderLayer('full', glowing());

      const wandering = [...container.querySelectorAll('[role="img"]')].filter((el) =>
        el.getAttribute('aria-label')?.startsWith('Wandering'),
      );
      expect(wandering).toHaveLength(1);
      expect(wandering[0]!.querySelector('ellipse')).not.toBeNull();
      expect(wandering[0]!.querySelector('[filter]')).toBeNull();
    });

    it('draws stars in hero mode too, still without a filter on any star', () => {
      const { container } = renderLayer('hero');

      expect(container.querySelectorAll('ellipse').length).toBeGreaterThanOrEqual(2);
      expect(container.querySelectorAll('path').length).toBeGreaterThanOrEqual(2);
      for (const g of container.querySelectorAll('[filter]')) {
        expect(g.querySelector('circle')).toBeNull();
      }
    });

    it('gives every gradient its own id, safe inside url(#…), even for odd session ids', () => {
      const odd = (id: string, i: number): CompletedSession => ({ ...star(i), id });
      const state = deriveSky(
        [
          odd('dev/seed:constellation:kite:session:0', 1),
          odd('dev/seed:constellation:kite:session:1', 2),
        ],
        [choice('dev/seed:constellation:kite', 'kite', T0)],
        rules,
      );
      const { container } = renderLayer('full', state);

      const ids = [...container.querySelectorAll('radialGradient')].map((g) =>
        g.getAttribute('id')!,
      );
      expect(ids.length).toBeGreaterThanOrEqual(2);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(id).toMatch(/^[A-Za-z][A-Za-z0-9_-]*$/);
      // Every fill that points at one of them points at one that exists.
      for (const el of container.querySelectorAll('[fill^="url(#"]')) {
        const target = el.getAttribute('fill')!.slice(5, -1);
        expect(ids).toContain(target);
      }
    });
  });

  describe('the engraved figure', () => {
    const figure = (container: HTMLElement) => container.querySelector('[data-atlas]');
    const opacityOf = (el: Element | null) => Number(el?.getAttribute('opacity'));

    /** The Kite after `n` of its 4 stars. */
    const kiteAfter = (n: number) =>
      deriveSky(
        Array.from({ length: n }, (_, i) => star(i + 1)),
        [kite],
        rules,
      );
    const kite = choice('c-kite', 'kite', T0);

    /** A generated ("wild") constellation: no hand-drawn art to show. */
    const wild = (): ConstellationChoice => ({
      id: 'c-wild',
      source: 'generated',
      shapeId: null,
      seed: 'wild-seed',
      tier: 'easy',
      chosenAt: T0,
    });

    it('draws a catalogue shape\u2019s own drawing behind it', () => {
      const { container } = renderLayer('full', kiteAfter(2));

      const art = figure(container);
      expect(art?.getAttribute('data-atlas')).toBe('art');
      expect(art?.querySelectorAll('path').length).toBeGreaterThanOrEqual(3);
    });

    it('draws a soft dotted outline for a shape with no drawing', () => {
      const { container } = renderLayer('full', deriveSky([star(1)], [wild()], rules));

      const outline = figure(container);
      expect(outline?.getAttribute('data-atlas')).toBe('outline');
      expect(outline?.getAttribute('stroke-dasharray')).toBeTruthy();
      expect(outline?.getAttribute('d')).toMatch(/^M.+Z$/);
    });

    it('is decorative: hidden from assistive tech, with no role or name', () => {
      const { container } = renderLayer('full', kiteAfter(2));

      const art = figure(container)!;
      expect(art.getAttribute('aria-hidden')).toBe('true');
      expect(art.hasAttribute('role')).toBe(false);
      expect(art.hasAttribute('aria-label')).toBe(false);
      expect(art.hasAttribute('tabindex')).toBe(false);
    });

    it('grows clearer as stars fill in, and is fully drawn when complete', () => {
      const at = (n: number) => opacityOf(figure(renderLayer('full', kiteAfter(n)).container));
      const levels = [at(1), at(2), at(3)];
      cleanup();
      const done = at(4);

      expect(levels[0]!).toBeGreaterThan(0);
      expect(levels[1]!).toBeGreaterThan(levels[0]!);
      expect(levels[2]!).toBeGreaterThan(levels[1]!);
      expect(done).toBeGreaterThan(levels[2]!);
      expect(done).toBe(ART_COMPLETE);
    });

    it('is drawn under the lines and stars of its constellation, in the same pixels', () => {
      const { container } = renderLayer('full', kiteAfter(2));

      const group = container.querySelector('[data-figure]')!;
      const children = [...group.children];
      const artAt = children.findIndex((c) => c.getAttribute('data-atlas') === 'art');
      const firstLine = children.findIndex((c) => c.tagName.toLowerCase() === 'line');
      const firstStar = children.findIndex((c) => c.getAttribute('role') === 'img');
      expect(artAt).toBeGreaterThanOrEqual(0);
      expect(artAt).toBeLessThan(firstLine);
      expect(artAt).toBeLessThan(firstStar);
    });

    it('is drawn in hero mode too, still and without a role', () => {
      const { container } = renderLayer('hero', kiteAfter(2));

      expect(figure(container)?.getAttribute('data-atlas')).toBe('art');
      expect(container.querySelector('[data-atlas][class]')).toBeNull();
    });

    it('draws a pack shape its own drawing too, whether or not its pack is owned', () => {
      const fox: ConstellationChoice = { ...kite, id: 'c-fox', shapeId: 'fox' };
      const mine = renderLayer('full', deriveSky([star(1)], [fox], rules));
      expect(figure(mine.container)?.getAttribute('data-atlas')).toBe('art');
      cleanup();

      // A friend’s shared constellation of a pack shape you do not own draws it as well.
      const theirs = deriveShared({
        id: 'sh-owl',
        partnerName: 'Bea',
        choice: { ...kite, id: 'sh-owl', shapeId: 'owl', tier: 'medium' },
        starsNeeded: 8,
        minFocusS: 0,
        acceptedAt: T0,
        stoppedAt: null,
        sessions: [],
      });
      const shared = render(
        <ConstellationLayer
          sky={deriveSky([], [], rules)}
          mode="full"
          width={1200}
          height={800}
          shared={[theirs]}
        />,
      );
      expect(shared.container.querySelector('[data-atlas]')?.getAttribute('data-atlas')).toBe(
        'art',
      );
    });
  });

  describe('the completion moment', () => {
    const celebrate = (delay: number, mode: 'hero' | 'full' = 'full') =>
      render(
        <ConstellationLayer
          sky={sky()}
          mode={mode}
          width={1200}
          height={800}
          celebrating={new Map([['c1', delay]])}
        />,
      );
    const kite = (container: HTMLElement) => container.querySelector('[data-figure="c1"]')!;
    const delayOf = (el: Element) => parseFloat((el as SVGElement).style.animationDelay);

    it('draws the lines in one after another, then traces the figure, blooms and flares the stars', () => {
      const { container } = celebrate(500);
      const figure = kite(container);

      const lines = [...figure.querySelectorAll('line.sky-draw')];
      expect(lines).toHaveLength(4);
      for (const line of lines) expect(line.getAttribute('pathLength')).toBe('1');
      const delays = lines.map(delayOf);
      expect(delays[0]).toBe(500);
      for (let i = 1; i < delays.length; i++) expect(delays[i]).toBeGreaterThan(delays[i - 1]!);

      const art = [...figure.querySelectorAll('[data-atlas] path.sky-draw')];
      expect(art.length).toBeGreaterThan(0);
      for (const path of art) expect(delayOf(path)).toBeGreaterThanOrEqual(delays.at(-1)!);

      const bloom = figure.querySelector('[data-celebration="bloom"]');
      expect(bloom?.getAttribute('class')).toBe('sky-bloom');
      expect(delayOf(bloom!)).toBe(500);

      expect(figure.querySelectorAll('.sky-flare')).toHaveLength(4);
    });

    it('leaves a figure that is not celebrating exactly as it was', () => {
      const { container } = renderLayer('full');
      expect(container.querySelector('.sky-draw, .sky-bloom, .sky-flare')).toBeNull();
      expect(container.querySelector('[data-celebration]')).toBeNull();
    });

    it('never plays behind the timer', () => {
      const { container } = celebrate(0, 'hero');
      expect(container.querySelector('.sky-draw, .sky-bloom, .sky-flare')).toBeNull();
    });
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
