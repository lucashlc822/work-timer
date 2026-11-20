// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { hasContent, MIN_USEFUL_SLOT, slotHeight } from './heroSlot';

describe('slotHeight (UI review M2)', () => {
  it('takes two thirds of all the free room, the slot and the space under the card together', () => {
    expect(slotHeight({ flex: 200, spare: 175, cap: NaN, reserve: 72 })).toBe(250);
  });

  it('takes the growth reserve from the whole room, not from the slot', () => {
    // 375 free: two thirds is 250, and 125 is still left for the card to grow into.
    expect(slotHeight({ flex: 200, spare: 175, cap: 256, reserve: 72 })).toBe(250);
    // 300 free: two thirds is 200, but only 100 leaves the reserve.
    expect(slotHeight({ flex: 200, spare: 100, cap: 256, reserve: 200 })).toBe(100);
  });

  it('stays within its cap', () => {
    expect(slotHeight({ flex: 256, spare: 500, cap: 256, reserve: 72 })).toBe(256);
  });

  it('is never negative, and ignores negative spare', () => {
    expect(slotHeight({ flex: 0, spare: 40, cap: 160, reserve: 72 })).toBe(0);
    expect(slotHeight({ flex: 120, spare: -20, cap: NaN, reserve: 0 })).toBe(80);
  });

  it('takes no room when it would be too short to draw the figure in', () => {
    expect(MIN_USEFUL_SLOT).toBe(79);
    // 120 free: two thirds is 80, just enough. 176 free less a 100 reserve is 76: too short.
    expect(slotHeight({ flex: 70, spare: 50, cap: 160, reserve: 0 })).toBe(80);
    expect(slotHeight({ flex: 76, spare: 100, cap: 160, reserve: 100 })).toBe(0);
  });
});

describe('hasContent (the slot is not frozen around "Opening…")', () => {
  /** jsdom has no layout, so give each child the height we want it to report. */
  const section = (...children: { html: string; height: number }[]): HTMLElement => {
    const el = document.createElement('section');
    for (const c of children) {
      const child = document.createElement('div');
      child.innerHTML = c.html;
      child.getBoundingClientRect = () => ({ height: c.height }) as DOMRect;
      el.append(child);
    }
    return el;
  };

  it('is false for nothing at all, and for children with no size', () => {
    expect(hasContent(null)).toBe(false);
    expect(hasContent(section())).toBe(false);
    expect(hasContent(section({ html: '<div data-timer-card></div>', height: 0 }))).toBe(false);
  });

  it('is false while the timer shows only "Opening…", even though that has a size', () => {
    expect(hasContent(section({ html: '<p data-timer-loading>Opening…</p>', height: 20 }))).toBe(
      false,
    );
  });

  it('is true once there is a sized card', () => {
    expect(hasContent(section({ html: '<div data-timer-card></div>', height: 448 }))).toBe(true);
  });
});
