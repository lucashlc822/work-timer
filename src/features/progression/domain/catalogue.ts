import { STAR_STYLE_PRICES, TIER_PRICES } from './economy';

/**
 * What the shop sells (M6). An item's `key` is permanent: it is written into
 * every purchase's ledger row (`ref`) and id, so a retired item stays owned
 * forever and a key is never reused for something else.
 *
 * The visuals for a star style live in `features/sky`, keyed by `styleKey`;
 * `app/` has a test that every style sold here can be drawn there.
 */
export type ItemKind = 'star-style' | 'tier';

export type BuyableTier = keyof typeof TIER_PRICES;

export interface CatalogueItem {
  key: string;
  kind: ItemKind;
  name: string;
  /** 0 for what everyone starts with. */
  price: number;
  /** For a star style: the key `features/sky` draws it by. */
  styleKey?: string;
  /** For a tier: which tier it unlocks. */
  tier?: BuyableTier;
}

/** The style everyone owns and every session starts with. */
export const DEFAULT_STYLE_KEY = 'classic';

const style = (styleKey: string, name: string, price: number): CatalogueItem => ({
  key: `style.${styleKey}`,
  kind: 'star-style',
  name,
  price,
  styleKey,
});

const tier = (t: BuyableTier, name: string): CatalogueItem => ({
  key: `tier.${t}`,
  kind: 'tier',
  name,
  price: TIER_PRICES[t],
  tier: t,
});

export const CATALOGUE: readonly CatalogueItem[] = [
  style(DEFAULT_STYLE_KEY, 'Classic', 0),
  style('ember', 'Ember', STAR_STYLE_PRICES.ember),
  style('aurora', 'Aurora', STAR_STYLE_PRICES.aurora),
  style('crystal', 'Crystal', STAR_STYLE_PRICES.crystal),
  style('prism', 'Prism', STAR_STYLE_PRICES.prism),
  tier('medium', 'Medium constellations'),
  tier('hard', 'Hard constellations'),
];

export const itemByKey = (key: string): CatalogueItem | undefined =>
  CATALOGUE.find((item) => item.key === key);

/** Owned from the start, with no purchase row. */
export const FREE_ITEM_KEYS: readonly string[] = CATALOGUE.filter((i) => i.price === 0).map(
  (i) => i.key,
);

export const itemsOfKind = (kind: ItemKind): CatalogueItem[] =>
  CATALOGUE.filter((item) => item.kind === kind);

/**
 * Everything owned: the free defaults plus every purchase row's `ref`. Pure, so
 * it is the same on every device that has the same ledger.
 */
export const ownedKeys = (
  ledger: readonly { reason: string; ref: string | null }[],
): ReadonlySet<string> => {
  const owned = new Set<string>(FREE_ITEM_KEYS);
  for (const row of ledger) if (row.reason === 'purchase' && row.ref !== null) owned.add(row.ref);
  return owned;
};

/** The tiers bought early, from the owned set. */
export const boughtTiers = (owned: ReadonlySet<string>): ReadonlySet<BuyableTier> => {
  const tiers = new Set<BuyableTier>();
  for (const item of itemsOfKind('tier')) {
    if (item.tier !== undefined && owned.has(item.key)) tiers.add(item.tier);
  }
  return tiers;
};

/** The sky keys of every star style on sale, so `app/` can check each one can be drawn. */
export const SHOP_STYLE_KEYS: readonly string[] = itemsOfKind('star-style').flatMap((i) =>
  i.styleKey === undefined ? [] : [i.styleKey],
);
