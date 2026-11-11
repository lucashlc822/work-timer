// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Shop } from './Shop';

const mocks = vi.hoisted(() => ({
  balance: 0,
  owned: new Set<string>(['style.classic', 'theme.night']),
  equippedStyle: 'classic',
  buyItem: vi.fn(),
  equipStyle: vi.fn(),
  equipTheme: vi.fn(),
}));

vi.mock('../hooks/useStardust', () => ({
  buyItem: mocks.buyItem,
  equipStyle: mocks.equipStyle,
  equipTheme: mocks.equipTheme,
  useBalance: () => mocks.balance,
  useOwned: () => mocks.owned,
  useEquippedStyle: () => mocks.equippedStyle,
  useEquippedSkyTheme: () => 'night',
}));

beforeEach(() => {
  mocks.balance = 0;
  mocks.owned = new Set(['style.classic', 'theme.night']);
  mocks.equippedStyle = 'classic';
  mocks.buyItem.mockReset();
  mocks.equipStyle.mockReset();
});

afterEach(cleanup);

const renderShop = (props: Partial<Parameters<typeof Shop>[0]> = {}) =>
  render(
    <Shop
      userId="u1"
      earnedTiers={{}}
      renderStylePreview={() => null}
      renderThemePreview={() => null}
      renderPackPreview={() => null}
      {...props}
    />,
  );

const card = (name: string) => {
  const li = screen.getAllByRole('listitem').find((el) => within(el).queryByText(name) !== null);
  if (li === undefined) throw new Error(`no card for ${name}`);
  return li;
};

describe('the shop', () => {
  it('shows what is already equipped as a readable status, not a faded disabled button', () => {
    renderShop();

    const equipped = screen.getAllByText('Equipped');
    // The classic style and the night theme.
    expect(equipped).toHaveLength(2);
    for (const label of equipped) {
      expect(label.closest('button')).toBeNull();
      expect(label.className).toContain('text-ink-secondary');
      expect(label.className).not.toContain('opacity');
    }
  });

  it('rings the equipped card and no other', () => {
    renderShop();
    expect(card('Classic').className).toContain('border-lavender-400');
    expect(card('Classic').className).not.toContain('hover:');
    expect(card('Ember').className).not.toContain(' border-lavender-400');
  });

  it('says how much of each collection you own', () => {
    renderShop();
    expect(screen.getByText('1 of 5 owned')).toBeTruthy();
    expect(screen.getByText('1 of 4 owned')).toBeTruthy();
    expect(screen.getByText('0 of 2 owned')).toBeTruthy();
  });

  it('offers Buy with the price when you can pay, and how far to go when you cannot', () => {
    mocks.balance = 442;
    renderShop();

    const ember = card('Ember');
    expect(within(ember).getByText(/300/)).toBeTruthy();
    expect(within(ember).getByRole('button', { name: 'Buy Ember for 300 Stardust' })).toBeTruthy();

    const crystal = card('Crystal');
    expect(within(crystal).getByText(/500/)).toBeTruthy();
    expect(within(crystal).getByText('58 more to go')).toBeTruthy();
    // No dead button to read as broken.
    expect(within(crystal).queryByRole('button')).toBeNull();
  });

  it('buying calls through with the item, and refusals are said gently', async () => {
    mocks.balance = 442;
    mocks.buyItem.mockResolvedValue({ ok: false, reason: 'insufficient' });
    renderShop();

    fireEvent.click(within(card('Ember')).getByRole('button', { name: /^Buy Ember/ }));
    expect(mocks.buyItem).toHaveBeenCalledWith('u1', 'style.ember');
    expect(await screen.findByText('Not enough Stardust yet.')).toBeTruthy();
  });

  it('an owned style that is not worn offers Equip', () => {
    mocks.owned = new Set(['style.classic', 'style.ember', 'theme.night']);
    renderShop();

    const ember = card('Ember');
    expect(within(ember).getByText('Owned')).toBeTruthy();
    fireEvent.click(within(ember).getByRole('button', { name: 'Equip Ember' }));
    expect(mocks.equipStyle).toHaveBeenCalledWith('ember');
  });

  it('shows an owned pack and an earned tier as statuses', () => {
    mocks.owned = new Set(['style.classic', 'theme.night', 'pack.woodland']);
    renderShop({ earnedTiers: { medium: true } });

    expect(within(card('Woodland pack')).getByText('Owned').closest('button')).toBeNull();
    expect(within(card('Medium constellations')).getByText('Unlocked')).toBeTruthy();
    expect(screen.getByText('1 of 2 owned')).toBeTruthy();
  });

  it('asks the sky for bigger previews, a card-sized swatch and labelled packs', () => {
    const renderStylePreview = vi.fn(() => null);
    const renderThemePreview = vi.fn(() => null);
    const renderPackPreview = vi.fn(() => null);
    renderShop({ renderStylePreview, renderThemePreview, renderPackPreview });

    expect(renderStylePreview).toHaveBeenCalledWith('ember', 72);
    expect(renderThemePreview).toHaveBeenCalledWith('dusk', 'card');
    expect(renderPackPreview).toHaveBeenCalledWith('woodland', true);
  });
});
