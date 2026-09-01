import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { LAVENDER_300, NIGHT_900, STAR_WARM } from '../../design-tokens.mjs';

/**
 * `design-tokens.mjs` mirrors a handful of values from `tokens.css` so that
 * build-time consumers which cannot read CSS (the PWA manifest and the
 * procedural icon generator) can use them. Mirrored constants drift silently,
 * so this test makes the drift loud instead.
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
  ])('%s matches the value exported from design-tokens.mjs', (property, mirrored) => {
    expect(cssValueOf(property)).toBe(mirrored);
  });
});
