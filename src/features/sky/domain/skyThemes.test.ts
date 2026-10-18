import { describe, expect, it } from 'vitest';

import { hashSeed } from '@/shared/lib';

import { ambientField } from './ambient';
import { SKY_THEMES, skyThemeFor, themeSwatchBackground } from './skyThemes';

// Captured from `ambientField()` as it was before sky themes existed (M6 PR 4).
// If these change, the default sky changes for everyone who never buys a theme.
const GOLDEN = {
  hash: 660511359,
  stars: 222,
  nebula: 26,
  firstStar: {
    x: 0.9963730410672724,
    y: 0.36961117992177606,
    layer: 0,
    radius: 0.4420327415806241,
    alpha: 0.2672531052492559,
    color: '#f3f7fa',
    twinklePhase: 4.616018786705016,
    twinklePeriodMs: 3949.7337363427505,
  },
  firstPuff: {
    x: 0.3896875705895946,
    y: 0.3506951274652965,
    radius: 0.13755932696163656,
    color: '#ab93e6',
    alpha: 0.0649289431516081,
  },
  lastPuff: {
    x: 0.534758868701756,
    y: 0.06957501989090815,
    radius: 0.23549113027751448,
    color: '#f3b8d4',
    alpha: 0.043777281511574985,
  },
};

const fingerprint = (key?: string | null) => {
  const field = ambientField(key);
  return {
    hash: hashSeed(JSON.stringify(field)),
    stars: field.stars.length,
    nebula: field.nebula.length,
    firstStar: field.stars[0],
    firstPuff: field.nebula[0],
    lastPuff: field.nebula.at(-1),
  };
};

describe('the night theme', () => {
  // Case 11 (themes): night renders exactly as it did before themes existed.
  it('is the pre-M6 sky, byte for byte', () => {
    expect(fingerprint()).toEqual(GOLDEN);
    expect(fingerprint('night')).toEqual(GOLDEN);
  });

  it('is what an unknown, null or absent theme draws as', () => {
    for (const key of ['from-the-future', '', null, undefined]) {
      expect(fingerprint(key)).toEqual(GOLDEN);
    }
    expect(skyThemeFor('from-the-future')).toBe(SKY_THEMES['night']);
  });

  it("adds no ground: the app's own night shows behind it", () => {
    expect(SKY_THEMES['night']?.ground).toBeNull();
  });
});

describe('the other themes', () => {
  const others = Object.keys(SKY_THEMES).filter((key) => key !== 'night');
  const base = ambientField();

  it('keep every star and cloud exactly where it was, and change only colour', () => {
    for (const key of others) {
      const field = ambientField(key);
      expect(field.stars.length, key).toBe(base.stars.length);
      expect(field.nebula.length, key).toBe(base.nebula.length);
      field.stars.forEach((star, i) => {
        const { color: _c, ...geometry } = star;
        const { color: _b, ...baseGeometry } = base.stars[i]!;
        expect(geometry).toEqual(baseGeometry);
      });
      field.nebula.forEach((puff, i) => {
        const { color: _c, ...geometry } = puff;
        const { color: _b, ...baseGeometry } = base.nebula[i]!;
        expect(geometry).toEqual(baseGeometry);
      });
    }
  });

  it('recolour the clouds from their own four hues', () => {
    for (const key of others) {
      const hues = new Set(ambientField(key).nebula.map((p) => p.color));
      for (const hue of hues) expect(SKY_THEMES[key]?.cloudHues, key).toContain(hue);
      expect(hues, key).not.toEqual(new Set(base.nebula.map((p) => p.color)));
    }
  });

  it('are deterministic, and produce valid hex colours throughout', () => {
    for (const key of others) {
      const field = ambientField(key);
      expect(JSON.stringify(field)).toBe(JSON.stringify(ambientField(key)));
      for (const star of field.stars) expect(star.color).toMatch(/^#[0-9a-f]{6}$/);
      for (const puff of field.nebula) expect(puff.color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('have a dark ground, so the pale text on top stays readable', () => {
    for (const key of others) {
      const ground = SKY_THEMES[key]?.ground;
      expect(ground, key).not.toBeNull();
      for (const hex of ground ?? []) {
        const n = parseInt(hex.slice(1), 16);
        const luminance = (((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255)) / 3;
        expect(luminance, `${key} ${hex}`).toBeLessThan(60);
      }
    }
  });
});

describe('themeSwatchBackground', () => {
  it('builds a layered CSS background for every theme, and for an unknown one', () => {
    for (const key of [...Object.keys(SKY_THEMES), 'nope']) {
      const css = themeSwatchBackground(key);
      expect(css, key).toContain('radial-gradient');
      expect(css, key).toContain('linear-gradient');
    }
  });
});
