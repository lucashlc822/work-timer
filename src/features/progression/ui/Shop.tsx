import { useCallback, useId, useState, type ReactNode } from 'react';

import {
  itemsOfKind,
  type BuyableTier,
  type CatalogueItem,
  type ItemKind,
} from '../domain/catalogue';
import { shopState, type ShopContext } from '../domain/shopState';
import {
  buyItem,
  equipStyle,
  equipTheme,
  useBalance,
  useEquippedSkyTheme,
  useEquippedStyle,
  useOwned,
} from '../hooks/useStardust';
import { ShopCard, ShortcutRow, type FocusTarget, type ItemProps, type Tile } from './ShopCard';

export interface ShopProps {
  userId: string;
  /** Tiers already earned by finishing the tier below; nothing to buy there. */
  earnedTiers: Readonly<Partial<Record<BuyableTier, boolean>>>;
  /** A star in the given style, drawn by the sky through `app/`; `size` is in px. */
  renderStylePreview: (styleKey: string, size?: number) => ReactNode;
  /** A swatch of the given sky theme, drawn by the sky through `app/`. */
  renderThemePreview: (themeKey: string, size?: 'sm' | 'card') => ReactNode;
  /** The shapes in the given constellation pack, drawn by the sky through `app/`. */
  renderPackPreview: (packKey: string, labelled?: boolean) => ReactNode;
}

const REFUSALS: Record<string, string> = {
  insufficient: 'Not enough Stardust yet.',
  owned: 'You already own that.',
  free: 'That one is free.',
  unknown: 'That item is no longer for sale.',
};

const STYLE_PREVIEW_PX = 72;

const headingClass = 'font-atlas tracking-atlas text-lavender-200 text-base';

/**
 * Spend Stardust: star styles (which apply to stars born from now on — each
 * star keeps the style it was born with), sky themes, constellation packs, and
 * constellation tiers bought early. Owning is derived from the ledger, so a
 * purchase on one device shows on the others once they sync.
 *
 * Buying is deliberate: Buy asks "Buy Ember for 300? You'll have 142 left." in
 * place, and only the second Buy spends. At most one item asks at a time.
 */
export const Shop = ({
  userId,
  earnedTiers,
  renderStylePreview,
  renderThemePreview,
  renderPackPreview,
}: ShopProps) => {
  const balance = useBalance();
  const owned = useOwned();
  const equippedStyle = useEquippedStyle();
  const equippedTheme = useEquippedSkyTheme();
  const [notice, setNotice] = useState<string | null>(null);
  /** The item key that is asking "are you sure?", if any. */
  const [asking, setAsking] = useState<string | null>(null);
  /** The item key just bought, for its one flare. */
  const [bought, setBought] = useState<string | null>(null);
  /** For a screen reader, said politely after a purchase. */
  const [announcement, setAnnouncement] = useState('');
  /** Where focus goes next, on which item. */
  const [pending, setPending] = useState<{ key: string; target: FocusTarget } | null>(null);
  const base = useId();
  const clearPending = useCallback(() => setPending(null), []);

  if (
    balance === undefined ||
    owned === undefined ||
    equippedStyle === undefined ||
    equippedTheme === undefined
  ) {
    return null;
  }

  const ctx: ShopContext = { balance, owned, equippedStyle, equippedTheme, earnedTiers };

  const ask = (item: CatalogueItem) => {
    setNotice(null);
    setAsking(item.key);
    setPending({ key: item.key, target: 'confirm' });
  };

  const cancel = (item: CatalogueItem) => {
    setAsking(null);
    setPending({ key: item.key, target: 'buy' });
  };

  const confirm = async (item: CatalogueItem) => {
    const result = await buyItem(userId, item.key);
    setAsking(null);
    if (result.ok) {
      setNotice(null);
      setBought(item.key);
      setAnnouncement(`${item.name} is yours.`);
      setPending({ key: item.key, target: 'settle' });
    } else {
      setNotice(REFUSALS[result.reason] ?? 'That did not work.');
      setPending({ key: item.key, target: 'buy' });
    }
  };

  const equip = (item: CatalogueItem) => {
    if (item.kind === 'star-style' && item.styleKey !== undefined) void equipStyle(item.styleKey);
    if (item.kind === 'sky-theme' && item.themeKey !== undefined) void equipTheme(item.themeKey);
  };

  const itemProps = (item: CatalogueItem): ItemProps => ({
    item,
    state: shopState(item, ctx),
    balance,
    confirming: asking === item.key,
    flare: bought === item.key,
    focusTarget: pending?.key === item.key ? pending.target : null,
    onFocused: clearPending,
    onAsk: () => ask(item),
    onConfirm: () => void confirm(item),
    onCancel: () => cancel(item),
    onEquip: () => equip(item),
  });

  const card = (item: CatalogueItem, preview: ReactNode, tile: Tile) => (
    <ShopCard key={item.key} {...itemProps(item)} preview={preview} tile={tile} />
  );

  /** A kind of thing for sale: a heading, how much of it you have, its note, then its cards. */
  const collection = (
    kind: ItemKind,
    title: string,
    note: string,
    grid: string,
    cards: ReactNode,
  ) => {
    const items = itemsOfKind(kind);
    const have = items.filter((i) => owned.has(i.key)).length;
    const id = `${base}-${kind}`;
    return (
      <div role="group" aria-labelledby={id} className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h3 id={id} className={headingClass}>
            {title}
          </h3>
          <span className="text-ink-muted text-xs whitespace-nowrap">
            {have} of {items.length} owned
          </span>
        </div>
        <p className="text-ink-secondary text-xs">{note}</p>
        <ul className={grid}>{cards}</ul>
      </div>
    );
  };

  return (
    <div className="flex w-full flex-col gap-8">
      {collection(
        'star-style',
        'Star styles',
        'A new style marks the stars you earn from now on. Stars already in your sky keep the style they were born with.',
        'grid grid-cols-2 gap-3 sm:grid-cols-3',
        itemsOfKind('star-style').map((item) =>
          card(
            item,
            item.styleKey === undefined
              ? null
              : renderStylePreview(item.styleKey, STYLE_PREVIEW_PX),
            'stars',
          ),
        ),
      )}

      {collection(
        'sky-theme',
        'Sky themes',
        'A theme re-colours the night behind your stars, and applies at once.',
        'grid grid-cols-1 gap-3 sm:grid-cols-2',
        itemsOfKind('sky-theme').map((item) =>
          card(
            item,
            item.themeKey === undefined ? null : renderThemePreview(item.themeKey, 'card'),
            'sky',
          ),
        ),
      )}

      {collection(
        'pack',
        'Constellation packs',
        "A pack adds new shapes to the picker: one easy, one medium and one hard. Constellations you've already started aren't affected.",
        'grid grid-cols-1 gap-3 sm:grid-cols-2',
        itemsOfKind('pack').map((item) =>
          card(
            item,
            item.packKey === undefined ? null : renderPackPreview(item.packKey, true),
            'plain',
          ),
        ),
      )}

      <div role="group" aria-labelledby={`${base}-shortcuts`} className="flex flex-col gap-3">
        <h3 id={`${base}-shortcuts`} className={headingClass}>
          Shortcuts
        </h3>
        <p className="text-ink-secondary text-xs">
          Finishing an easier constellation unlocks the next tier for free; this is the shortcut.
        </p>
        <ul className="border-night-600 bg-night-800/70 divide-night-600 rounded-soft divide-y border">
          {itemsOfKind('tier').map((item) => (
            <ShortcutRow key={item.key} {...itemProps(item)} />
          ))}
        </ul>
      </div>

      {notice !== null && (
        <p role="status" className="text-faded text-center text-xs">
          {notice}
        </p>
      )}
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
};
