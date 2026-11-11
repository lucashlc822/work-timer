import type { BuyableTier, CatalogueItem } from './catalogue';

/**
 * What a shop card offers right now. One state at a time, so the card can show
 * exactly one footer.
 */
export type ShopState =
  /** Worn now. */
  | { type: 'equipped' }
  /** Owned, wearable, not worn: offer Equip. */
  | { type: 'equip' }
  /** A pack you own. */
  | { type: 'owned' }
  /** A tier you have, bought or earned. */
  | { type: 'unlocked' }
  /** For sale and you can pay. */
  | { type: 'buy' }
  /** For sale, you can't pay yet: `missing` Stardust to go. */
  | { type: 'short'; missing: number };

export interface ShopContext {
  balance: number;
  owned: ReadonlySet<string>;
  equippedStyle: string;
  equippedTheme: string;
  earnedTiers: Readonly<Partial<Record<BuyableTier, boolean>>>;
}

export const shopState = (item: CatalogueItem, ctx: ShopContext): ShopState => {
  const have = ctx.owned.has(item.key);

  if (item.kind === 'star-style' || item.kind === 'sky-theme') {
    const key = item.kind === 'star-style' ? item.styleKey : item.themeKey;
    const current = item.kind === 'star-style' ? ctx.equippedStyle : ctx.equippedTheme;
    if (key !== undefined && have)
      return current === key ? { type: 'equipped' } : { type: 'equip' };
  }
  if (item.kind === 'pack' && have) return { type: 'owned' };
  if (
    item.kind === 'tier' &&
    item.tier !== undefined &&
    (have || ctx.earnedTiers[item.tier] === true)
  ) {
    return { type: 'unlocked' };
  }

  return ctx.balance >= item.price
    ? { type: 'buy' }
    : { type: 'short', missing: item.price - ctx.balance };
};
