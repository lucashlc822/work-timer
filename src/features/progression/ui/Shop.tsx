import { useState, type ReactNode } from 'react';

import { itemsOfKind, type BuyableTier, type CatalogueItem } from '../domain/catalogue';
import {
  buyItem,
  equipStyle,
  equipTheme,
  useBalance,
  useEquippedSkyTheme,
  useEquippedStyle,
  useOwned,
} from '../hooks/useStardust';
import { stardust } from './format';

export interface ShopProps {
  userId: string;
  /** Tiers already earned by finishing the tier below; nothing to buy there. */
  earnedTiers: Readonly<Partial<Record<BuyableTier, boolean>>>;
  /** A small star in the given style, drawn by the sky through `app/`. */
  renderStylePreview: (styleKey: string) => ReactNode;
  /** A small swatch of the given sky theme, drawn by the sky through `app/`. */
  renderThemePreview: (themeKey: string) => ReactNode;
  /** The shapes in the given constellation pack, drawn by the sky through `app/`. */
  renderPackPreview: (packKey: string) => ReactNode;
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
 * star keeps the style it was born with), sky themes, constellation packs, and
 * constellation tiers bought early. Owning is derived from the ledger, so a
 * purchase on one device shows on the others once they sync.
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

  if (
    balance === undefined ||
    owned === undefined ||
    equippedStyle === undefined ||
    equippedTheme === undefined
  ) {
    return null;
  }

  const buy = async (item: CatalogueItem) => {
    const result = await buyItem(userId, item.key);
    setNotice(result.ok ? null : (REFUSALS[result.reason] ?? 'That did not work.'));
  };

  const done = (label: string) => (
    <button type="button" disabled className={quiet}>
      {label}
    </button>
  );

  /** Equipped / Equip for something you can wear, and nothing for the rest. */
  const equipAction = (
    item: CatalogueItem,
    current: string,
    key: string | undefined,
    equip: (key: string) => Promise<boolean>,
  ): ReactNode => {
    if (key === undefined || !owned.has(item.key)) return null;
    if (current === key) return done('Equipped');
    return (
      <button type="button" className={primary} onClick={() => void equip(key)}>
        Equip
      </button>
    );
  };

  const action = (item: CatalogueItem): ReactNode => {
    const have = owned.has(item.key);
    const equip =
      item.kind === 'star-style'
        ? equipAction(item, equippedStyle, item.styleKey, equipStyle)
        : item.kind === 'sky-theme'
          ? equipAction(item, equippedTheme, item.themeKey, equipTheme)
          : null;
    if (equip !== null) return equip;
    if (item.kind === 'pack' && have) return done('Owned');
    if (
      item.kind === 'tier' &&
      item.tier !== undefined &&
      (have || earnedTiers[item.tier] === true)
    ) {
      return done('Unlocked');
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

  const section = (title: string, note: string, rows: ReactNode) => (
    <div className="flex flex-col gap-2">
      <h3 className="text-ink-secondary text-xs tracking-widest uppercase">{title}</h3>
      <ul className="border-night-600 bg-night-800/70 divide-night-600 rounded-soft divide-y border">
        {rows}
      </ul>
      <p className="text-ink-muted text-xs">{note}</p>
    </div>
  );

  return (
    <section aria-label="Shop" className="flex w-full flex-col gap-4">
      {section(
        'Star styles',
        'A new style marks the stars you earn from now on. Stars already in your sky keep the style they were born with.',
        itemsOfKind('star-style').map((item) =>
          row(
            item,
            item.styleKey === undefined ? undefined : (
              <span className="flex h-10 w-10 items-center justify-center">
                {renderStylePreview(item.styleKey)}
              </span>
            ),
          ),
        ),
      )}

      {section(
        'Sky themes',
        'A theme re-colours the night behind your stars, and applies at once.',
        itemsOfKind('sky-theme').map((item) =>
          row(item, item.themeKey === undefined ? undefined : renderThemePreview(item.themeKey)),
        ),
      )}

      {section(
        'Constellation packs',
        "A pack adds new shapes to the picker: one easy, one medium and one hard. Constellations you've already started aren't affected.",
        itemsOfKind('pack').map((item) =>
          row(item, item.packKey === undefined ? undefined : renderPackPreview(item.packKey)),
        ),
      )}

      {section(
        'Unlock a tier early',
        'Finishing an easier constellation unlocks the next tier for free; this is the shortcut.',
        itemsOfKind('tier').map((item) => row(item)),
      )}

      {notice !== null && (
        <p role="status" className="text-faded text-center text-xs">
          {notice}
        </p>
      )}
    </section>
  );
};
