import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';

import type { CatalogueItem } from '../domain/catalogue';
import type { ShopState } from '../domain/shopState';
import { count } from './format';

const button = 'rounded-pill border px-4 py-1.5 text-xs whitespace-nowrap transition-colors';
const primary = `${button} border-lavender-400 bg-lavender-400/15 text-ink-primary hover:bg-lavender-400/25`;
const quiet = `${button} border-night-600 text-ink-secondary hover:border-lavender-400 hover:text-ink-primary`;
const status =
  'text-ink-secondary inline-flex items-center gap-1.5 border border-transparent py-1.5 text-xs whitespace-nowrap';

/** Where focus goes next on one item: into its confirm step, back to Buy, or onto what it became. */
export type FocusTarget = 'confirm' | 'buy' | 'settle';

/** What a card and a shortcut row share: the item, its state, and the buying flow. */
export interface ItemProps {
  item: CatalogueItem;
  state: ShopState;
  balance: number;
  /** This item is asking "are you sure?". */
  confirming: boolean;
  /** Just bought: its picture flares once. */
  flare: boolean;
  /** Where focus should go on this item next, if anywhere. */
  focusTarget: FocusTarget | null;
  onFocused: () => void;
  onAsk: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  onEquip: () => void;
}

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
 * button, so it reads at full ink-secondary instead of a faded 60%. Focusable
 * by script only, so a purchase can land focus on it.
 */
const Done = ({
  label,
  settleRef,
}: {
  label: string;
  settleRef?: (el: HTMLElement | null) => void;
}) => (
  <span className={status} ref={settleRef} tabIndex={settleRef === undefined ? undefined : -1}>
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

interface ItemRefs {
  buyRef: RefObject<HTMLButtonElement | null>;
  confirmRef: RefObject<HTMLButtonElement | null>;
  settleRef: (el: HTMLElement | null) => void;
}

/**
 * Lands focus where the buying flow says to: the confirm button when asked, the
 * Buy button after "Not now", and the Equip button (or the Owned status) after a
 * purchase. A target whose element isn't there yet waits for the next render, so
 * a purchase that settles a moment later still gets its focus.
 */
const useItemFocus = ({
  focusTarget,
  onFocused,
  state,
  confirming,
}: Pick<ItemProps, 'focusTarget' | 'onFocused' | 'state' | 'confirming'>): ItemRefs => {
  const buyRef = useRef<HTMLButtonElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const settled = useRef<HTMLElement | null>(null);
  const settleRef = useCallback((el: HTMLElement | null) => {
    settled.current = el;
  }, []);

  useEffect(() => {
    if (focusTarget === null) return;
    const el =
      focusTarget === 'confirm'
        ? confirmRef.current
        : focusTarget === 'buy'
          ? buyRef.current
          : settled.current;
    if (el === null) return;
    el.focus();
    onFocused();
  }, [focusTarget, onFocused, state.type, confirming]);

  return { buyRef, confirmRef, settleRef };
};

/** The footer for one state: the price and the one thing you can do about it. */
const ShopAction = ({
  item,
  state,
  onAsk,
  onEquip,
  buyRef,
  settleRef,
}: Pick<ItemProps, 'item' | 'state' | 'onAsk' | 'onEquip'> &
  Pick<ItemRefs, 'buyRef' | 'settleRef'>): ReactNode => {
  switch (state.type) {
    case 'equipped':
      return <Done label="Equipped" />;
    case 'owned':
      return <Done label="Owned" settleRef={settleRef} />;
    case 'unlocked':
      return <Done label="Unlocked" settleRef={settleRef} />;
    case 'equip':
      return (
        <>
          <span className="text-ink-secondary text-xs">Owned</span>
          <button
            type="button"
            ref={settleRef}
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
            ref={buyRef}
            className={primary}
            aria-label={`Buy ${item.name} for ${count(item.price)} Stardust`}
            onClick={onAsk}
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

/**
 * "Buy Ember for ✦ 300? You'll have ✦ 142 left." with Buy and Not now, in place
 * of the item's footer. The question is the confirm button's description, so a
 * screen reader hears it as focus lands there.
 */
const ConfirmBuy = ({
  item,
  balance,
  confirmRef,
  onConfirm,
  onCancel,
}: Pick<ItemProps, 'item' | 'balance' | 'onConfirm' | 'onCancel'> &
  Pick<ItemRefs, 'confirmRef'>) => {
  const id = useId();
  return (
    <div className="flex w-full flex-col gap-2">
      <p id={id} className="text-ink-primary text-xs">
        Buy {item.name} for <Price amount={item.price} />? You’ll have{' '}
        <Price amount={balance - item.price} /> left.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          ref={confirmRef}
          className={primary}
          aria-describedby={id}
          onClick={onConfirm}
        >
          Buy
        </button>
        <button type="button" className={quiet} onClick={onCancel}>
          Not now
        </button>
      </div>
    </div>
  );
};

/** Escape closes the question and nothing else: the panel stays, as a sky card's Escape does. */
const escapeCancels =
  (confirming: boolean, onCancel: () => void) => (e: KeyboardEvent<HTMLElement>) => {
    if (!confirming || e.key !== 'Escape') return;
    e.stopPropagation();
    onCancel();
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
const PreviewTile = ({
  tile,
  flare,
  children,
}: {
  tile: Tile;
  flare: boolean;
  children: ReactNode;
}) => {
  if (tile === 'sky') {
    return <div className={`overflow-hidden ${flare ? 'shop-pulse' : ''}`}>{children}</div>;
  }
  if (tile === 'plain') {
    return (
      <div className={`bg-night-950/60 flex justify-center px-2 py-4 ${flare ? 'shop-pulse' : ''}`}>
        {children}
      </div>
    );
  }
  return (
    <div className="bg-night-950 relative flex h-28 items-center justify-center">
      <span aria-hidden className="absolute inset-0 opacity-40" style={{ backgroundImage: DOTS }} />
      <span className={`relative flex ${flare ? 'shop-flare' : ''}`}>{children}</span>
    </div>
  );
};

/**
 * One thing for sale: its picture, its name, then its price and what you can do.
 *
 * Asking "are you sure?" must not move the shop: the question takes the card's
 * whole face in the same grid cell, while the usual face stays laid out but
 * invisible and inert, so the card (and its row) keeps its height. A question
 * taller than the card would grow it rather than be clipped.
 */
export const ShopCard = ({
  preview,
  tile,
  ...p
}: ItemProps & { preview: ReactNode; tile: Tile }) => {
  const { item, state, confirming, flare } = p;
  const refs = useItemFocus(p);
  const asking = confirming && state.type === 'buy';
  return (
    <li
      onKeyDown={escapeCancels(asking, p.onCancel)}
      className={`rounded-soft bg-night-800/70 grid overflow-hidden border transition-colors ${
        state.type === 'equipped'
          ? 'border-lavender-400'
          : 'border-night-600 hover:border-lavender-400/60'
      }`}
    >
      <div
        className={`col-start-1 row-start-1 flex flex-col ${asking ? 'invisible' : ''}`}
        inert={asking}
        aria-hidden={asking || undefined}
      >
        <PreviewTile tile={tile} flare={flare}>
          {preview}
        </PreviewTile>
        <div className="flex flex-1 flex-col gap-3 p-3">
          <span className="text-ink-primary text-sm whitespace-nowrap">{item.name}</span>
          <div className="mt-auto flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <ShopAction
              item={item}
              state={state}
              onAsk={p.onAsk}
              onEquip={p.onEquip}
              buyRef={refs.buyRef}
              settleRef={refs.settleRef}
            />
          </div>
        </div>
      </div>
      {asking && (
        <div className="col-start-1 row-start-1 flex flex-col justify-center p-3">
          <ConfirmBuy
            item={item}
            balance={p.balance}
            confirmRef={refs.confirmRef}
            onConfirm={p.onConfirm}
            onCancel={p.onCancel}
          />
        </div>
      )}
    </li>
  );
};

/** A tier unlock: a compact row with no picture, buying the same deliberate way. */
export const ShortcutRow = (p: ItemProps) => {
  const { item, state, confirming } = p;
  const refs = useItemFocus(p);
  const asking = confirming && state.type === 'buy';
  return (
    <li
      onKeyDown={escapeCancels(asking, p.onCancel)}
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3"
    >
      <span className="text-ink-primary text-sm">{item.name}</span>
      {asking ? (
        <ConfirmBuy
          item={item}
          balance={p.balance}
          confirmRef={refs.confirmRef}
          onConfirm={p.onConfirm}
          onCancel={p.onCancel}
        />
      ) : (
        <span className="flex items-center gap-3">
          <ShopAction
            item={item}
            state={state}
            onAsk={p.onAsk}
            onEquip={p.onEquip}
            buyRef={refs.buyRef}
            settleRef={refs.settleRef}
          />
        </span>
      )}
    </li>
  );
};
