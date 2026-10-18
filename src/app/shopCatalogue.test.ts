import { describe, expect, it } from 'vitest';

import { SHOP_PACK_KEYS, SHOP_STYLE_KEYS, SHOP_THEME_KEYS } from '@/features/progression';
import { PACK_KEYS, SKY_THEME_KEYS, STAR_STYLE_KEYS } from '@/features/sky';

// `app/` may see both features, so this is where "everything the shop sells can
// be drawn or offered" is checked — neither feature may import the other.
describe('what the shop sells', () => {
  it('every star style on sale has a look in the sky', () => {
    expect(SHOP_STYLE_KEYS.length).toBeGreaterThan(1);
    for (const key of SHOP_STYLE_KEYS) expect(STAR_STYLE_KEYS, key).toContain(key);
  });

  it('every sky theme on sale can be drawn', () => {
    expect(SHOP_THEME_KEYS.length).toBeGreaterThan(1);
    for (const key of SHOP_THEME_KEYS) expect(SKY_THEME_KEYS, key).toContain(key);
  });

  it('every pack on sale has shapes in the sky, and every sky pack is on sale', () => {
    expect(SHOP_PACK_KEYS.length).toBeGreaterThan(0);
    for (const key of SHOP_PACK_KEYS) expect(PACK_KEYS, key).toContain(key);
    for (const key of PACK_KEYS) expect(SHOP_PACK_KEYS, key).toContain(key);
  });
});
