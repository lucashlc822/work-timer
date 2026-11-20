import { describe, expect, it } from 'vitest';

import { placePopover } from './popoverPlacement';

const at = (triggerBottom: number, contentHeight: number, windowHeight = 800) =>
  placePopover({
    triggerTop: triggerBottom - 28,
    triggerBottom,
    windowHeight,
    contentHeight,
  });

describe('placePopover (UI review M3)', () => {
  it('opens below when it fits', () => {
    expect(at(400, 300)).toEqual({ side: 'below', maxHeight: 800 - 400 - 8 - 12 });
  });

  it('flips above when it does not fit below and there is more room above', () => {
    const p = at(700, 320);
    expect(p.side).toBe('above');
    expect(p.maxHeight).toBe(700 - 28 - 8 - 12);
  });

  it('stays below, capped, when above is no roomier', () => {
    const p = at(200, 900);
    expect(p.side).toBe('below');
    expect(p.maxHeight).toBe(800 - 200 - 8 - 12);
  });

  it('caps a tall popover on the roomier side', () => {
    const p = at(700, 2000);
    expect(p).toEqual({ side: 'above', maxHeight: 652 });
  });

  it('never returns a negative height', () => {
    expect(at(795, 300, 800).maxHeight).toBeGreaterThanOrEqual(0);
  });
});
