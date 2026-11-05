import { describe, expect, it } from 'vitest';

import { CARD_EDGE, CARD_GAP, cardPosition } from './cardPosition';

const CARD = { w: 200, h: 100 };
const VIEW = { w: 800, h: 600 };
const INSETS = { top: 0, bottom: 88 };

describe('cardPosition', () => {
  it('centres the card above the star when there is room', () => {
    const at = cardPosition({ x: 400, y: 300, r: 4 }, CARD, VIEW, INSETS);
    expect(at).toEqual({ side: 'above', left: 300, top: 300 - 4 - CARD_GAP - 100 });
  });

  it('flips below a star near the top', () => {
    const at = cardPosition({ x: 400, y: 40, r: 4 }, CARD, VIEW, INSETS);
    expect(at.side).toBe('below');
    expect(at.top).toBe(40 + 4 + CARD_GAP);
  });

  it('keeps clear of the bottom inset (the Back button), going above a star near it', () => {
    const at = cardPosition({ x: 400, y: 560, r: 4 }, CARD, VIEW, INSETS);
    expect(at.side).toBe('above');
    expect(at.top + CARD.h).toBeLessThanOrEqual(VIEW.h - INSETS.bottom - CARD_EDGE);
  });

  it('pulls a card at the left or right edge back inside the window', () => {
    expect(cardPosition({ x: 10, y: 300, r: 4 }, CARD, VIEW, INSETS).left).toBe(CARD_EDGE);
    expect(cardPosition({ x: 795, y: 300, r: 4 }, CARD, VIEW, INSETS).left).toBe(
      VIEW.w - CARD_EDGE - CARD.w,
    );
  });

  it('prefers below when asked, as a friend’s sky does under its header', () => {
    const at = cardPosition({ x: 400, y: 300, r: 4 }, CARD, VIEW, INSETS, 'below');
    expect(at.side).toBe('below');
    // …and still goes above when below doesn't fit.
    expect(cardPosition({ x: 400, y: 500, r: 4 }, CARD, VIEW, INSETS, 'below').side).toBe('above');
  });

  it('in a window too short for either side, picks the roomier one and stays inside', () => {
    const short = { w: 800, h: 200 };
    const at = cardPosition({ x: 400, y: 60, r: 4 }, CARD, short, { top: 0, bottom: 0 });
    expect(at.top).toBeGreaterThanOrEqual(CARD_EDGE);
    expect(at.top + CARD.h).toBeLessThanOrEqual(short.h - CARD_EDGE);
  });

  it('respects a top inset', () => {
    const at = cardPosition({ x: 400, y: 150, r: 4 }, CARD, VIEW, { top: 100, bottom: 0 });
    expect(at.side).toBe('below');
  });
});
