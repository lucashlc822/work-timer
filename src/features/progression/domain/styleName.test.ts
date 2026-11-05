import { describe, expect, it } from 'vitest';

import { styleName } from './catalogue';

describe('styleName', () => {
  it('names a style as the shop sells it', () => {
    expect(styleName('ember')).toBe('Ember');
    expect(styleName('prism')).toBe('Prism');
    expect(styleName('classic')).toBe('Classic');
  });

  it('calls a missing or unknown style Classic, which is how it is drawn', () => {
    expect(styleName(undefined)).toBe('Classic');
    expect(styleName('no-such-style')).toBe('Classic');
  });
});
