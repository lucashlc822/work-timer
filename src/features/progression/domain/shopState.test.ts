import { describe, expect, it } from 'vitest';

import { itemByKey } from './catalogue';
import { shopState, type ShopContext } from './shopState';

const ctx = (over: Partial<ShopContext> = {}): ShopContext => ({
  balance: 442,
  owned: new Set(['style.classic', 'theme.night']),
  equippedStyle: 'classic',
  equippedTheme: 'night',
  earnedTiers: {},
  ...over,
});

const item = (key: string) => {
  const found = itemByKey(key);
  if (found === undefined) throw new Error(`no item ${key}`);
  return found;
};

describe('shopState', () => {
  it('the worn style and theme are equipped', () => {
    expect(shopState(item('style.classic'), ctx())).toEqual({ type: 'equipped' });
    expect(shopState(item('theme.night'), ctx())).toEqual({ type: 'equipped' });
  });

  it('an owned style or theme that is not worn can be equipped', () => {
    const owned = new Set(['style.classic', 'style.ember', 'theme.night', 'theme.dusk']);
    expect(shopState(item('style.ember'), ctx({ owned }))).toEqual({ type: 'equip' });
    expect(shopState(item('theme.dusk'), ctx({ owned }))).toEqual({ type: 'equip' });
    expect(shopState(item('style.ember'), ctx({ owned, equippedStyle: 'ember' }))).toEqual({
      type: 'equipped',
    });
  });

  it('something for sale is a buy if you can pay, and says how far to go if you cannot', () => {
    expect(shopState(item('style.ember'), ctx())).toEqual({ type: 'buy' });
    expect(shopState(item('style.crystal'), ctx())).toEqual({ type: 'short', missing: 58 });
    // Exactly the price is enough.
    expect(shopState(item('style.ember'), ctx({ balance: 300 }))).toEqual({ type: 'buy' });
    expect(shopState(item('style.ember'), ctx({ balance: 299 }))).toEqual({
      type: 'short',
      missing: 1,
    });
  });

  it('a pack you own is owned', () => {
    const owned = new Set(['style.classic', 'theme.night', 'pack.woodland']);
    expect(shopState(item('pack.woodland'), ctx({ owned }))).toEqual({ type: 'owned' });
    expect(shopState(item('pack.harbour'), ctx({ owned }))).toEqual({
      type: 'short',
      missing: 358,
    });
  });

  it('a tier is unlocked when bought or earned', () => {
    expect(shopState(item('tier.medium'), ctx({ earnedTiers: { medium: true } }))).toEqual({
      type: 'unlocked',
    });
    expect(shopState(item('tier.hard'), ctx({ owned: new Set(['tier.hard']) }))).toEqual({
      type: 'unlocked',
    });
    expect(shopState(item('tier.medium'), ctx({ balance: 5000 }))).toEqual({ type: 'buy' });
  });
});
