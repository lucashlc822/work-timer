import { describe, expect, it } from 'vitest';

import { possessive } from './possessive';

describe('possessive', () => {
  it('adds ’s, or only an apostrophe after an s', () => {
    expect(possessive('Ada')).toBe("Ada's");
    expect(possessive('Wes')).toBe("Wes'");
  });
});
