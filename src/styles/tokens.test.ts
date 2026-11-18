import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  MOTION,
  LAVENDER_300,
  LAVENDER_400,
  MINT_300,
  NIGHT_900,
  ROSE_300,
  STAR_COOL,
  STAR_CORE,
  STAR_WHITE,
  STAR_WARM,
} from '../../design-tokens.mjs';

/**
 * `design-tokens.mjs` mirrors a handful of values from `tokens.css` so that
 * consumers which cannot read CSS (the PWA manifest, the procedural icon
 * generator, and the sky renderer) can use them. Mirrored constants drift
 * silently, so this test makes the drift loud instead.
 */
describe('design token mirror', () => {
  // Resolved from the project root rather than `import.meta.url`: Vitest serves
  // modules over http, so `import.meta.url` is not a file:// URL here.
  const css = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8');

  const cssValueOf = (customProperty: string): string | undefined => {
    const match = new RegExp(`${customProperty}:\\s*([^;]+);`).exec(css);
    return match?.[1]?.trim();
  };

  it.each([
    ['--color-night-900', NIGHT_900],
    ['--color-lavender-300', LAVENDER_300],
    ['--color-star-warm', STAR_WARM],
    ['--color-star-cool', STAR_COOL],
    ['--color-star-core', STAR_CORE],
    ['--color-star-white', STAR_WHITE],
    ['--color-lavender-400', LAVENDER_400],
    ['--color-rose-300', ROSE_300],
    ['--color-mint-300', MINT_300],
  ])('%s matches the value exported from design-tokens.mjs', (property, mirrored) => {
    expect(cssValueOf(property)).toBe(mirrored);
  });
});

describe('motion token mirror', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8');
  const cssValueOf = (customProperty: string): string | undefined =>
    new RegExp(`${customProperty}:\\s*([^;]+);`).exec(css)?.[1]?.trim();

  it.each([
    ['--duration-press', MOTION.duration.press],
    ['--duration-quick', MOTION.duration.quick],
    ['--duration-enter', MOTION.duration.enter],
    ['--duration-exit', MOTION.duration.exit],
    ['--duration-panel-in', MOTION.duration.panelIn],
    ['--duration-panel-out', MOTION.duration.panelOut],
    ['--duration-page-in', MOTION.duration.pageIn],
    ['--duration-page-out', MOTION.duration.pageOut],
    ['--duration-stagger', MOTION.duration.stagger],
  ])('%s is %i ms in both places', (property, ms) => {
    expect(cssValueOf(property)).toBe(`${ms}ms`);
  });

  it.each([
    ['--ease-standard', MOTION.ease.standard],
    ['--ease-enter', MOTION.ease.enter],
    ['--ease-exit', MOTION.ease.exit],
  ])('%s matches its control points', (property, points) => {
    expect(cssValueOf(property)).toBe(`cubic-bezier(${points.join(', ')})`);
  });
});
