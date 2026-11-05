/**
 * Where a card about a star goes: centred on its preferred side of the star
 * (above, unless asked otherwise) when there's room, otherwise the other side,
 * and always inside the window. `insets` keep it off
 * whatever floats over the sky's edges (the Back button at the bottom, a
 * friend's header at the top).
 *
 * Pure, so the awkward cases (a star in a corner, a window shorter than the
 * card) are tested rather than eyeballed.
 */
export interface CardAnchor {
  x: number;
  y: number;
  /** The star's visible radius: the card clears it by `gap`. */
  r: number;
}

export interface CardInsets {
  top: number;
  bottom: number;
}

export interface CardPlacement {
  left: number;
  top: number;
  side: 'above' | 'below';
}

/** Space between the star and the card. */
export const CARD_GAP = 12;
/** Space between the card and the window's edges. */
export const CARD_EDGE = 8;

const clamp = (value: number, low: number, high: number): number =>
  high < low ? low : Math.min(Math.max(value, low), high);

export const cardPosition = (
  anchor: CardAnchor,
  card: { w: number; h: number },
  view: { w: number; h: number },
  insets: CardInsets = { top: 0, bottom: 0 },
  prefer: CardPlacement['side'] = 'above',
): CardPlacement => {
  const ceiling = insets.top + CARD_EDGE;
  const floor = view.h - insets.bottom - CARD_EDGE;

  const aboveTop = anchor.y - anchor.r - CARD_GAP - card.h;
  const belowTop = anchor.y + anchor.r + CARD_GAP;
  const fitsAbove = aboveTop >= ceiling;
  const fitsBelow = belowTop + card.h <= floor;

  // The preferred side when it fits; the other when only that fits; otherwise
  // whichever has more room, pushed back inside the window.
  const roomierAbove = anchor.y - ceiling >= floor - anchor.y;
  const side: CardPlacement['side'] =
    prefer === 'above'
      ? fitsAbove || (!fitsBelow && roomierAbove)
        ? 'above'
        : 'below'
      : fitsBelow || (!fitsAbove && !roomierAbove)
        ? 'below'
        : 'above';
  const top = clamp(side === 'above' ? aboveTop : belowTop, ceiling, floor - card.h);

  const left = clamp(anchor.x - card.w / 2, CARD_EDGE, view.w - CARD_EDGE - card.w);
  return { left, top, side };
};
