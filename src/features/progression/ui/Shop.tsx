import { useState, type ReactNode } from 'react';

import { itemsOfKind, type BuyableTier, type CatalogueItem } from '../domain/catalogue';
import { buyItem, equipStyle, useBalance, useEquippedStyle, useOwned } from '../hooks/useStardust';
import { stardust } from './format';

export interface ShopProps {
  userId: string;
  /** Tiers already earned by finishing the tier below; nothing to buy there. */
  earnedTiers: Readonly<Partial<Record<BuyableTier, boolean>>>;
  /** A small star in the given style, drawn by the sky through `app/`. */
  renderStylePreview: (styleKey: string) => ReactNode;
}

const REFUSALS: Record<string, string> = {
  insufficient: 'Not enough Stardust yet.',
  owned: 'You already own that.',
  free: 'That one is free.',
  unknown: 'That item is no longer for sale.',
};

const button =
  'rounded-pill border px-4 py-1.5 text-xs transition-colors disabled:cursor-default disabled:opacity-60';
const primary = `${button} border-lavender-400 bg-lavender-400/15 text-ink-primary hover:bg-lavender-400/25`;
const quiet = `${button} border-night-600 text-ink-secondary hover:border-lavender-400 hover:text-ink-primary`;

/**
 * Spend Stardust: star styles (which apply to stars born from now on — each
 * star keeps the style it was born with) and constellation tiers bought early.
 * Owning is derived from the ledger, so a purchase on one device shows on the
 * others once they sync.
 */
export const Shop = ({ userId, earnedTiers, renderStylePreview }: ShopProps) => {
  const balance = useBalance();
  const owned = useOwned();
  const equipped = useEquippedStyle();
  const [notice, setNotice] = useState<string | null>(null);

  if (balance === undefined || owned === undefined || equipped === undefined) return null;

  const buy = async (item: CatalogueItem) => {
    const result = await buyItem(userId, item.key);
    setNotice(result.ok ? null : (REFUSALS[result.reason] ?? 'That did not work.'));
  };

  const action = (item: CatalogueItem) => {
    const have = owned.has(item.key);
    if (item.kind === 'star-style' && item.styleKey !== undefined) {
      const styleKey = item.styleKey;
      if (have && equipped === styleKey) {
        return (
          <button type="button" disabled className={quiet}>
            Equipped
          </button>
        );
      }
      if (have) {
        return (
          <button type="button" className={primary} onClick={() => void equipStyle(styleKey)}>
            Equip
          </button>
        );
      }
    } else if (item.tier !== undefined && (have || earnedTiers[item.tier] === true)) {
      return (
        <button type="button" disabled className={quiet}>
          Unlocked
        </button>
      );
    }
    const affordable = balance >= item.price;
    return (
      <button
        type="button"
        disabled={!affordable}
        className={affordable ? primary : quiet}
        onClick={() => void buy(item)}
      >
        {affordable ? `Buy · ${stardust(item.price)}` : `Needs ${stardust(item.price)}`}
      </button>
    );
  };

  const row = (item: CatalogueItem, preview?: ReactNode) => (
    <li key={item.key} className="flex items-center justify-between gap-4 px-4 py-3">
      <span className="flex items-center gap-3">
        {preview}
        <span className="text-ink-primary text-sm">{item.name}</span>
      </span>
      {action(item)}
    </li>
  );

  return (
    <section aria-label="Shop" className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h3 className="text-ink-secondary text-xs tracking-widest uppercase">Star styles</h3>
        <ul className="border-night-600 bg-night-800/70 divide-night-600 divide-y rounded-xl border">
          {itemsOfKind('star-style').map((item) =>
            row(
              item,
              item.styleKey === undefined ? undefined : (
                <span className="flex h-10 w-10 items-center justify-center">
                  {renderStylePreview(item.styleKey)}
                </span>
              ),
            ),
          )}
        </ul>
        <p className="text-ink-muted text-xs">
          A new style marks the stars you earn from now on. Stars already in your sky keep the style
          they were born with.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-ink-secondary text-xs tracking-widest uppercase">
          Unlock a tier early
        </h3>
        <ul className="border-night-600 bg-night-800/70 divide-night-600 divide-y rounded-xl border">
          {itemsOfKind('tier').map((item) => row(item))}
        </ul>
        <p className="text-ink-muted text-xs">
          Finishing an easier constellation unlocks the next tier for free; this is the shortcut.
        </p>
      </div>

      {notice !== null && (
        <p role="status" className="text-faded text-center text-xs">
          {notice}
        </p>
      )}
    </section>
  );
};
