// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Shop } from './Shop';

vi.mock('../hooks/useStardust', () => ({
  buyItem: vi.fn(),
  equipStyle: vi.fn(),
  equipTheme: vi.fn(),
  useBalance: () => 0,
  useOwned: () => new Set(['style.classic', 'theme.night']),
  useEquippedStyle: () => 'classic',
  useEquippedSkyTheme: () => 'night',
}));

afterEach(cleanup);

describe('the shop', () => {
  it('shows what is already equipped as a readable status, not a faded disabled button', () => {
    render(
      <Shop
        userId="u1"
        earnedTiers={{}}
        renderStylePreview={() => null}
        renderThemePreview={() => null}
        renderPackPreview={() => null}
      />,
    );

    const equipped = screen.getAllByText('Equipped');
    // The classic style and the night theme.
    expect(equipped).toHaveLength(2);
    for (const label of equipped) {
      expect(label.closest('button')).toBeNull();
      expect(label.className).toContain('text-ink-secondary');
      expect(label.className).not.toContain('opacity');
    }
  });
});
