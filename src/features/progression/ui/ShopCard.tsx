import type { ReactNode } from 'react';

import type { CatalogueItem } from '../domain/catalogue';
import type { ShopState } from '../domain/shopState';
import { count } from './format';

const button = 'rounded-pill border px-4 py-1.5 text-xs whitespace-nowrap transition-colors';
const primary = `${button} border-lavender-400 bg-lavender-400/15 text-ink-primary hover:bg-lavender-400/25`;
const status =
  'text-ink-secondary inline-flex items-center gap-1.5 border border-transparent py-1.5 text-xs whitespace-nowrap';

/** What it costs, as "✦ 300" with the unit said for a screen reader. */
export const Price = ({ amount }: { amount: number }) => (
  <span className="text-star-warm text-sm whitespace-nowrap">
    <span aria-hidden>✦ </span>
    {count(amount)}
    <span className="sr-only"> Stardust</span>
  </span>
);

/**
 * What is already so (Equipped, Owned, Unlocked): a status, not a disabled
 * button, so it reads at full ink-secondary instead of a faded 60%.
 */
const Done = ({ label }: { label: string }) => (
  <span className={status}>
    <svg
      aria-hidden
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 6.5l2.5 2.5 4.5-5.5" />
    </svg>
    {label}
  </span>
);

/** The footer for one state: the price and the one thing you can do about it. */
export const ShopAction = ({
  item,
  state,
  onBuy,
  onEquip,
}: {
  item: CatalogueItem;
  state: ShopState;
  onBuy: () => void;
  onEquip: () => void;
}): ReactNode => {
  switch (state.type) {
    case 'equipped':
      return <Done label="Equipped" />;
    case 'owned':
      return <Done label="Owned" />;
    case 'unlocked':
      return <Done label="Unlocked" />;
    case 'equip':
      return (
        <>
          <span className="text-ink-secondary text-xs">Owned</span>
          <button
            type="button"
            className={primary}
            aria-label={`Equip ${item.name}`}
            onClick={onEquip}
          >
            Equip
          </button>
        </>
      );
    case 'buy':
      return (
        <>
          <Price amount={item.price} />
          <button
            type="button"
            className={primary}
            aria-label={`Buy ${item.name} for ${count(item.price)} Stardust`}
            onClick={onBuy}
          >
            Buy
          </button>
        </>
      );
    case 'short':
      return (
        <>
          <Price amount={item.price} />
          <span className="text-ink-secondary text-xs whitespace-nowrap">
            {count(state.missing)} more to go
          </span>
        </>
      );
  }
};

/** A few faint dots, from the star token, so a dark tile reads as a patch of sky. */
const DOTS = [
  'radial-gradient(circle at 14% 24%, var(--color-star-white) 0, transparent 1.2px)',
  'radial-gradient(circle at 82% 18%, var(--color-star-white) 0, transparent 1px)',
  'radial-gradient(circle at 70% 78%, var(--color-star-white) 0, transparent 1.2px)',
  'radial-gradient(circle at 24% 82%, var(--color-star-white) 0, transparent 1px)',
  'radial-gradient(circle at 92% 54%, var(--color-star-white) 0, transparent 1px)',
].join(', ');

export type Tile = 'stars' | 'sky' | 'plain';

/** The picture area: what the thing looks like is the point of the card. */
const PreviewTile = ({ tile, children }: { tile: Tile; children: ReactNode }) => {
  if (tile === 'sky') return <div className="overflow-hidden">{children}</div>;
  if (tile === 'plain') {
    return <div className="bg-night-950/60 flex justify-center px-2 py-4">{children}</div>;
  }
  return (
    <div className="bg-night-950 relative flex h-28 items-center justify-center">
      <span aria-hidden className="absolute inset-0 opacity-40" style={{ backgroundImage: DOTS }} />
      <span className="relative">{children}</span>
    </div>
  );
};

/** One thing for sale: its picture, its name, then its price and what you can do. */
export const ShopCard = ({
  item,
  state,
  preview,
  tile,
  onBuy,
  onEquip,
}: {
  item: CatalogueItem;
  state: ShopState;
  preview: ReactNode;
  tile: Tile;
  onBuy: () => void;
  onEquip: () => void;
}) => (
  <li
    className={`rounded-soft bg-night-800/70 flex flex-col overflow-hidden border transition-colors ${
      state.type === 'equipped'
        ? 'border-lavender-400'
        : 'border-night-600 hover:border-lavender-400/60'
    }`}
  >
    <PreviewTile tile={tile}>{preview}</PreviewTile>
    <div className="flex flex-1 flex-col gap-3 p-3">
      <span className="text-ink-primary text-sm whitespace-nowrap">{item.name}</span>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <ShopAction item={item} state={state} onBuy={onBuy} onEquip={onEquip} />
      </div>
    </div>
  </li>
);
