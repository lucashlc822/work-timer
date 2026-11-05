import { describe, expect, it } from 'vitest';

import { starAppearance } from './starAppearance';
import { STAR_FORMS, starForm, type StarForm, type TierStyle } from './starForm';
import { STAR_STYLE_KEYS } from './starStyles';

const BASE_R = 2.08;
const MIN = 60;

const formOf = (
  seed: string,
  focusS: number,
  style: string | null | undefined,
  tier: TierStyle = 'plain',
  base = BASE_R,
): StarForm => starForm(starAppearance(seed, focusS, style), focusS, style, base, tier);

const round = (n: number) => Math.round(n * 1000) / 1000;
const slim = (f: StarForm) => ({
  radius: round(f.radius),
  coreR: round(f.coreR),
  corona: {
    rx: round(f.corona.rx),
    ry: round(f.corona.ry),
    stops: f.corona.stops.map((s) => [s.offset, s.color, round(s.opacity)]),
  },
  spikes: f.spikes.map((s) => [
    round(s.angle),
    round(s.length),
    round(s.width),
    s.color,
    round(s.opacity),
  ]),
  ring: f.ring === null ? null : [round(f.ring.r), f.ring.color, round(f.ring.opacity)],
});

// Captured when Lucas approved the astrophoto look (View sky upgrade PR 2), for the
// classic style on the plain tier: the same four seeds as `starStyles.test.ts`.
// If these change, every star already in someone's sky is drawn differently.
const GOLDEN = [
  {
    seed: 'alpha',
    focusS: 1500,
    form: {
      radius: 2.072,
      coreR: 0.932,
      corona: {
        rx: 4.558,
        ry: 4.558,
        stops: [
          [0, '#ffedcf', 0.248],
          [0.35, '#ffedcf', 0.104],
          [1, '#ffedcf', 0],
        ],
      },
      spikes: [
        [0, 6.61, 1.036, '#fff3e0', 0.481],
        [1.571, 6.61, 1.036, '#fff3e0', 0.481],
        [3.142, 6.61, 1.036, '#fff3e0', 0.481],
        [4.712, 6.61, 1.036, '#fff3e0', 0.481],
      ],
      ring: null,
    },
  },
  {
    seed: 'beta',
    focusS: 300,
    form: {
      radius: 1.557,
      coreR: 0.701,
      corona: {
        rx: 3.425,
        ry: 3.425,
        stops: [
          [0, '#fff2dd', 0.217],
          [0.35, '#fff2dd', 0.091],
          [1, '#fff2dd', 0],
        ],
      },
      spikes: [
        [0, 2.335, 0.778, '#fff7e9', 0.42],
        [1.571, 2.335, 0.778, '#fff7e9', 0.42],
        [3.142, 2.335, 0.778, '#fff7e9', 0.42],
        [4.712, 2.335, 0.778, '#fff7e9', 0.42],
      ],
      ring: null,
    },
  },
  {
    seed: 'gamma',
    focusS: 10800,
    form: {
      radius: 2.911,
      coreR: 1.31,
      corona: {
        rx: 6.405,
        ry: 6.405,
        stops: [
          [0, '#fff4e0', 0.31],
          [0.35, '#fff4e0', 0.13],
          [1, '#fff4e0', 0],
        ],
      },
      spikes: [
        [0, 18.924, 1.456, '#fff8eb', 0.6],
        [1.571, 18.924, 1.456, '#fff8eb', 0.6],
        [3.142, 18.924, 1.456, '#fff8eb', 0.6],
        [4.712, 18.924, 1.456, '#fff8eb', 0.6],
      ],
      ring: null,
    },
  },
  {
    seed: 'star-42',
    focusS: 3000,
    form: {
      radius: 2.412,
      coreR: 1.085,
      corona: {
        rx: 5.307,
        ry: 5.307,
        stops: [
          [0, '#fff8ea', 0.264],
          [0.35, '#fff8ea', 0.111],
          [1, '#fff8ea', 0],
        ],
      },
      spikes: [
        [0, 9.734, 1.206, '#fffaf1', 0.511],
        [1.571, 9.734, 1.206, '#fffaf1', 0.511],
        [3.142, 9.734, 1.206, '#fffaf1', 0.511],
        [4.712, 9.734, 1.206, '#fffaf1', 0.511],
      ],
      ring: null,
    },
  },
];

describe('starForm', () => {
  it.each(GOLDEN)('draws $seed the way it was approved', ({ seed, focusS, form }) => {
    expect(slim(formOf(seed, focusS, undefined))).toEqual(form);
    expect(slim(formOf(seed, focusS, 'classic'))).toEqual(form);
  });

  it('is deterministic: the same session draws the same star every time', () => {
    for (const style of STAR_STYLE_KEYS) {
      expect(formOf('alpha', 1500, style, 'glow')).toEqual(formOf('alpha', 1500, style, 'glow'));
    }
  });

  it('has a recipe for every star style and none for a style that does not exist', () => {
    expect(Object.keys(STAR_FORMS).sort()).toEqual([...STAR_STYLE_KEYS].sort());
  });

  it('draws an unknown or missing style as classic', () => {
    const classic = formOf('beta', 1500, 'classic');
    // `starAppearance` also falls back to classic colours, so the whole form matches.
    expect(formOf('beta', 1500, 'no-such-style')).toEqual(classic);
    expect(formOf('beta', 1500, undefined)).toEqual(classic);
    expect(formOf('beta', 1500, null)).toEqual(classic);
  });

  it('gives each style its own number of spikes', () => {
    const counts = Object.fromEntries(
      STAR_STYLE_KEYS.map((style) => [style, formOf('alpha', 1500, style).spikes.length]),
    );
    expect(counts).toEqual({ classic: 4, ember: 4, aurora: 2, crystal: 6, prism: 4 });
  });

  it('lets only prism have a ring', () => {
    for (const style of STAR_STYLE_KEYS) {
      expect(formOf('alpha', 1500, style).ring !== null).toBe(style === 'prism');
    }
  });

  describe('spike length says how long the session was', () => {
    const lengthAt = (style: string, minutes: number, seed = 'alpha') =>
      Math.max(...formOf(seed, minutes * MIN, style).spikes.map((s) => s.length));

    it.each(STAR_STYLE_KEYS)('grows with focus time in %s', (style) => {
      const lengths = [5, 25, 60, 120, 180].map((m) => lengthAt(style, m));
      for (let i = 1; i < lengths.length; i++) {
        expect(lengths[i]).toBeGreaterThan(lengths[i - 1] as number);
      }
    });

    it('grows by the same factor in every style, whatever its own personality', () => {
      // A style scales its spikes (ember's are short), but never how they respond to time.
      const growth = STAR_STYLE_KEYS.map((style) => lengthAt(style, 180) / lengthAt(style, 5));
      for (const g of growth) expect(g).toBeCloseTo(growth[0] as number, 6);
    });

    it('depends on nothing but the session: the star seed only jitters its size', () => {
      // Same focus, different seed: the spike is the star's own radius times one fixed factor.
      for (const style of STAR_STYLE_KEYS) {
        const ratios = ['a', 'b', 'c', 'd'].map((seed) => {
          const f = formOf(seed, 60 * MIN, style);
          return Math.max(...f.spikes.map((s) => s.length)) / f.radius;
        });
        for (const r of ratios) expect(r).toBeCloseTo(ratios[0] as number, 6);
      }
    });

    it('is scaled down by spikeScale, for wandering stars', () => {
      const look = starAppearance('alpha', 1500);
      const full = starForm(look, 1500, undefined, BASE_R, 'plain');
      const small = starForm(look, 1500, undefined, BASE_R, 'plain', { spikeScale: 0.6 });
      expect(small.spikes[0]!.length).toBeCloseTo(full.spikes[0]!.length * 0.6, 9);
      expect(small.radius).toBe(full.radius);
    });
  });

  it('points every star of one style the same way, as in a real image', () => {
    for (const style of STAR_STYLE_KEYS) {
      const angles = (seed: string) => formOf(seed, 25 * MIN, style).spikes.map((s) => s.angle);
      expect(angles('x')).toEqual(angles('y'));
      expect(angles('x')).toEqual(angles('z'));
    }
  });

  it('reaches further into the sky for a richer tier', () => {
    const reach = (tier: TierStyle) => formOf('alpha', 1500, 'classic', tier).corona.rx;
    expect(reach('plain')).toBeLessThan(reach('glow'));
    expect(reach('glow')).toBeLessThan(reach('nebula'));
  });

  it("stretches aurora's corona upward and keeps the others round", () => {
    for (const style of STAR_STYLE_KEYS) {
      const { rx, ry } = formOf('alpha', 1500, style).corona;
      if (style === 'aurora') expect(ry).toBeGreaterThan(rx * 1.5);
      else expect(ry).toBeCloseTo(rx, 9);
    }
  });

  it('fades the corona out to nothing at its edge, and only ever uses real colours', () => {
    for (const style of STAR_STYLE_KEYS) {
      for (const tier of ['plain', 'glow', 'nebula'] as const) {
        const f = formOf('gamma', 3 * 60 * MIN, style, tier);
        expect(f.corona.stops.at(-1)!.opacity).toBe(0);
        const colours = [...f.corona.stops.map((s) => s.color), ...f.spikes.map((s) => s.color)];
        for (const c of colours) expect(c).toMatch(/^#[0-9a-f]{6}$/);
        for (const n of [
          f.radius,
          f.coreR,
          f.corona.rx,
          f.corona.ry,
          ...f.spikes.map((s) => s.length),
        ]) {
          expect(Number.isFinite(n) && n > 0).toBe(true);
        }
      }
    }
  });

  it('never draws a spike thinner than a sliver of a pixel', () => {
    // A tiny star's spike must still be visible, not sub-pixel.
    for (const style of STAR_STYLE_KEYS) {
      for (const s of formOf('beta', 5 * MIN, style, 'plain', 1.3).spikes) {
        expect(s.width).toBeGreaterThanOrEqual(0.6);
      }
    }
  });
});
