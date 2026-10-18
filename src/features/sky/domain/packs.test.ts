import { describe, expect, it } from 'vitest';

import { CATALOGUE, catalogueKeysForTier, PACK_KEYS, packShapes } from './catalogue';
import { TIER_ORDER } from './types';

// Case 11 — pack shapes are valid (growth order, no crossings, star counts: the
// parametrised "the catalogue" tests in shapes.test.ts cover every entry,
// packs included) and hidden in the picker until the pack is owned.
describe('constellation packs', () => {
  it('has the two packs the shop sells', () => {
    expect([...PACK_KEYS].sort()).toEqual(['harbour', 'woodland']);
  });

  it('gives each pack one easy, one medium and one hard shape', () => {
    for (const pack of PACK_KEYS) {
      expect(
        packShapes(pack).map(({ entry }) => entry.tier),
        pack,
      ).toEqual([...TIER_ORDER]);
    }
  });

  it('hides pack shapes by default, so nobody sees what they have not bought', () => {
    for (const tier of TIER_ORDER) {
      const shown = catalogueKeysForTier(tier);
      expect(shown.length).toBeGreaterThan(0);
      for (const key of shown) {
        expect((CATALOGUE[key] as { pack?: string }).pack, key).toBeUndefined();
      }
    }
    expect(catalogueKeysForTier('easy')).toEqual(['kite', 'arrow', 'teacup']);
  });

  it("shows a pack's shapes once it is owned, alongside the ones everyone has", () => {
    const woodland = new Set(['woodland']);
    expect(catalogueKeysForTier('easy', woodland)).toEqual(['kite', 'arrow', 'teacup', 'fox']);
    expect(catalogueKeysForTier('medium', woodland)).toContain('owl');
    expect(catalogueKeysForTier('hard', woodland)).toContain('stag');
    // Another pack stays hidden.
    expect(catalogueKeysForTier('easy', woodland)).not.toContain('sailboat');
  });

  it('shows both packs when both are owned', () => {
    const both = new Set(['woodland', 'harbour']);
    for (const tier of TIER_ORDER) {
      const keys = catalogueKeysForTier(tier, both);
      for (const pack of PACK_KEYS) {
        const shape = packShapes(pack).find(({ entry }) => entry.tier === tier);
        expect(keys, `${pack} ${tier}`).toContain(shape?.key);
      }
    }
  });

  it('keeps the original shapes unchanged (their keys are permanent)', () => {
    for (const key of [
      'kite',
      'arrow',
      'teacup',
      'lantern',
      'swan',
      'harp',
      'heron',
      'lighthouse',
      'whale',
    ]) {
      expect(CATALOGUE, key).toHaveProperty(key);
      expect((CATALOGUE as Record<string, { pack?: string }>)[key]?.pack).toBeUndefined();
    }
  });
});
