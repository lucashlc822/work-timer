import { describe, expect, it } from 'vitest';

import { SHOP_STYLE_KEYS } from '@/features/progression';
import { STAR_STYLE_KEYS } from '@/features/sky';

// `app/` may see both features, so this is where "everything the shop sells can
// be drawn" is checked — neither feature may import the other.
describe('star styles', () => {
  it('every style the shop sells has a look in the sky', () => {
    expect(SHOP_STYLE_KEYS.length).toBeGreaterThan(1);
    for (const key of SHOP_STYLE_KEYS) expect(STAR_STYLE_KEYS, key).toContain(key);
  });
});
