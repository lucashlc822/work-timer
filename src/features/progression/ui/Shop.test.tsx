// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

const askToBuy = (name: string, price: string) =>
  fireEvent.click(
    within(card(name)).getByRole('button', { name: `Buy ${name} for ${price} Stardust` }),
  );

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

describe('buying', () => {
  beforeEach(() => {
    mocks.balance = 442;
  });

  it('Buy only asks: it says what is left and spends nothing, with focus on the confirm button', () => {
    renderShop();
    askToBuy('Ember', '300');

    const ember = card('Ember');
    expect(within(ember).getByText(/Buy Ember for/).textContent).toContain('You’ll have');
    expect(within(ember).getByText(/You’ll have/).textContent).toMatch(/142/);
    expect(mocks.buyItem).not.toHaveBeenCalled();

    const confirm = within(ember).getByRole('button', { name: 'Buy' });
    expect(document.activeElement).toBe(confirm);
    // The question is the button's description, heard as focus lands.
    const described = confirm.getAttribute('aria-describedby');
    expect(document.getElementById(described ?? '')?.textContent).toContain('Buy Ember for');
  });

  it('Not now spends nothing and puts focus back on Buy', () => {
    renderShop();
    askToBuy('Ember', '300');
    fireEvent.click(within(card('Ember')).getByRole('button', { name: 'Not now' }));

    expect(mocks.buyItem).not.toHaveBeenCalled();
    expect(within(card('Ember')).queryByText(/You’ll have/)).toBeNull();
    expect(document.activeElement).toBe(
      within(card('Ember')).getByRole('button', { name: 'Buy Ember for 300 Stardust' }),
    );
  });

  it('Escape does the same as Not now and does not reach the panel behind', () => {
    const outside = vi.fn();
    document.addEventListener('keydown', outside);
    renderShop();
    askToBuy('Ember', '300');

    fireEvent.keyDown(within(card('Ember')).getByRole('button', { name: 'Buy' }), {
      key: 'Escape',
    });
    expect(mocks.buyItem).not.toHaveBeenCalled();
    expect(within(card('Ember')).queryByText(/You’ll have/)).toBeNull();
    expect(document.activeElement).toBe(
      within(card('Ember')).getByRole('button', { name: 'Buy Ember for 300 Stardust' }),
    );
    expect(outside).not.toHaveBeenCalled();

    // With nothing being asked, Escape is not ours: it goes on to leave the panel.
    fireEvent.keyDown(within(card('Ember')).getByRole('button', { name: /^Buy Ember/ }), {
      key: 'Escape',
    });
    expect(outside).toHaveBeenCalledTimes(1);
    document.removeEventListener('keydown', outside);
  });

  it('only one item asks at a time', () => {
    renderShop();
    askToBuy('Ember', '300');
    askToBuy('Aurora', '400');

    expect(screen.getAllByRole('button', { name: 'Not now' })).toHaveLength(1);
    expect(within(card('Aurora')).getByRole('button', { name: 'Not now' })).toBeTruthy();
    expect(within(card('Ember')).queryByRole('button', { name: 'Not now' })).toBeNull();
    expect(document.activeElement).toBe(
      within(card('Aurora')).getByRole('button', { name: 'Buy' }),
    );
  });

  it('confirming buys once, says so politely, flares the star and lands focus on Equip', async () => {
    mocks.buyItem.mockImplementation(() => {
      mocks.balance = 142;
      mocks.owned = new Set([...mocks.owned, 'style.ember']);
      return Promise.resolve({ ok: true });
    });
    renderShop();
    askToBuy('Ember', '300');
    fireEvent.click(within(card('Ember')).getByRole('button', { name: 'Buy' }));

    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(card('Ember')).getByRole('button', { name: 'Equip Ember' }),
      ),
    );
    expect(mocks.buyItem).toHaveBeenCalledTimes(1);
    expect(mocks.buyItem).toHaveBeenCalledWith('u1', 'style.ember');
    expect(screen.getByText('Ember is yours.')).toBeTruthy();
    expect(card('Ember').querySelector('.shop-flare')).not.toBeNull();
    expect(card('Aurora').querySelector('.shop-flare')).toBeNull();
  });

  it('a pack bought lands focus on its Owned status and swells its tile', async () => {
    mocks.balance = 1000;
    mocks.buyItem.mockImplementation(() => {
      mocks.owned = new Set([...mocks.owned, 'pack.woodland']);
      return Promise.resolve({ ok: true });
    });
    renderShop();
    askToBuy('Woodland pack', '800');
    fireEvent.click(within(card('Woodland pack')).getByRole('button', { name: 'Buy' }));

    await waitFor(() =>
      expect(document.activeElement).toBe(within(card('Woodland pack')).getByText('Owned')),
    );
    expect(screen.getByText('Woodland pack is yours.')).toBeTruthy();
    expect(card('Woodland pack').querySelector('.shop-pulse')).not.toBeNull();
  });

  it('a refusal is said gently, and focus goes back to Buy', async () => {
    mocks.buyItem.mockResolvedValue({ ok: false, reason: 'insufficient' });
    renderShop();
    askToBuy('Ember', '300');
    fireEvent.click(within(card('Ember')).getByRole('button', { name: 'Buy' }));

    expect(await screen.findByText('Not enough Stardust yet.')).toBeTruthy();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(card('Ember')).getByRole('button', { name: 'Buy Ember for 300 Stardust' }),
      ),
    );
    expect(screen.queryByText('Ember is yours.')).toBeNull();
  });

  it('a tier unlock asks the same way, in its row', () => {
    mocks.balance = 5000;
    renderShop();
    fireEvent.click(
      within(card('Medium constellations')).getByRole('button', {
        name: 'Buy Medium constellations for 2,000 Stardust',
      }),
    );

    const row = card('Medium constellations');
    expect(within(row).getByText(/You’ll have/).textContent).toMatch(/3,000/);
    expect(mocks.buyItem).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(within(row).getByRole('button', { name: 'Buy' }));
  });
});
