import { PACK_PRICES, SKY_THEME_PRICES, STAR_STYLE_PRICES, TIER_PRICES } from './economy';

/**
 * What the shop sells (M6). An item's `key` is permanent: it is written into
 * every purchase's ledger row (`ref`) and id, so a retired item stays owned
 * forever and a key is never reused for something else.
 *
 * The visuals live in `features/sky`, keyed by `styleKey` / `themeKey` /
 * `packKey`; `app/` has a test that everything sold here can be drawn or
 * offered there.
 */
export type ItemKind = 'star-style' | 'sky-theme' | 'pack' | 'tier';

export type BuyableTier = keyof typeof TIER_PRICES;

export interface CatalogueItem {
  key: string;
  kind: ItemKind;
  name: string;
  /** 0 for what everyone starts with. */
  price: number;
  /** For a star style: the key `features/sky` draws it by. */
  styleKey?: string;
  /** For a sky theme: the key `features/sky` draws it by. */
  themeKey?: string;
  /** For a constellation pack: the key its shapes carry in `features/sky`. */
  packKey?: string;
  /** For a tier: which tier it unlocks. */
  tier?: BuyableTier;
}

/** The style everyone owns and every session starts with. */
export const DEFAULT_STYLE_KEY = 'classic';

/** The sky everyone owns: the original night. */
export const DEFAULT_THEME_KEY = 'night';

const style = (styleKey: string, name: string, price: number): CatalogueItem => ({
  key: `style.${styleKey}`,
  kind: 'star-style',
  name,
  price,
  styleKey,
});

const theme = (themeKey: string, name: string, price: number): CatalogueItem => ({
  key: `theme.${themeKey}`,
  kind: 'sky-theme',
  name,
  price,
  themeKey,
});

const pack = (packKey: string, name: string, price: number): CatalogueItem => ({
  key: `pack.${packKey}`,
  kind: 'pack',
  name,
  price,
  packKey,
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
  theme(DEFAULT_THEME_KEY, 'Night', 0),
  theme('dusk', 'Dusk', SKY_THEME_PRICES.dusk),
  theme('tide', 'Tide', SKY_THEME_PRICES.tide),
  theme('bloom', 'Bloom', SKY_THEME_PRICES.bloom),
  pack('woodland', 'Woodland pack', PACK_PRICES.woodland),
  pack('harbour', 'Harbour pack', PACK_PRICES.harbour),
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

/** The sky keys of every sky theme on sale, so `app/` can check each one can be drawn. */
export const SHOP_THEME_KEYS: readonly string[] = itemsOfKind('sky-theme').flatMap((i) =>
  i.themeKey === undefined ? [] : [i.themeKey],
);

/** The pack keys on sale, so `app/` can check each one has shapes in the sky. */
export const SHOP_PACK_KEYS: readonly string[] = itemsOfKind('pack').flatMap((i) =>
  i.packKey === undefined ? [] : [i.packKey],
);

/** The packs owned, from the owned set. */
export const ownedPackKeys = (owned: ReadonlySet<string>): ReadonlySet<string> => {
  const packs = new Set<string>();
  for (const item of itemsOfKind('pack')) {
    if (item.packKey !== undefined && owned.has(item.key)) packs.add(item.packKey);
  }
  return packs;
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
