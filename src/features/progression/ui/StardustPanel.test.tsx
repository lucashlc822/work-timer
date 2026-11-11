// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StardustPanel } from './StardustPanel';

const NOW = new Date(2026, 10, 9, 15, 30).getTime();

vi.mock('../hooks/useStardust', () => ({
  buyItem: vi.fn(),
  equipStyle: vi.fn(),
  equipTheme: vi.fn(),
  updateDailyGoal: vi.fn(),
  useBalance: () => 1234,
  useOwned: () => new Set(['style.classic', 'theme.night']),
  useEquippedStyle: () => 'classic',
  useEquippedSkyTheme: () => 'night',
  useProgress: () => ({ focusMin: 10, goalMin: 60, reached: false, streak: 0 }),
  useRecentLedger: () => [
    {
      id: 'a',
      reason: 'session',
      delta: 25,
      ref: null,
      createdAt: new Date(2026, 10, 9, 14, 0).getTime(),
    },
    {
      id: 'b',
      reason: 'goal',
      delta: 20,
      ref: null,
      createdAt: new Date(2026, 10, 8, 20, 0).getTime(),
    },
  ],
}));

const renderPanel = () =>
  render(
    <StardustPanel
      userId="u1"
      earnedTiers={{}}
      renderStylePreview={() => null}
      renderThemePreview={() => null}
      renderPackPreview={() => null}
    />,
  );

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('the Stardust panel', () => {
  it('opens on the shop, with the balance up front', () => {
    renderPanel();
    expect(screen.getByRole('tab', { name: 'Shop' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('region', { name: 'Shop' })).toBeTruthy();
    expect(screen.getByText('1,234')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Daily goal and streak' })).toBeNull();
  });

  it('has one tab stop; arrows move and wrap, Home and End jump, and selection follows focus', () => {
    renderPanel();
    const [shop, goal, history] = screen.getAllByRole('tab');
    expect(shop?.tabIndex).toBe(0);
    expect(goal?.tabIndex).toBe(-1);
    expect(history?.tabIndex).toBe(-1);

    shop?.focus();
    fireEvent.keyDown(shop as HTMLElement, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(goal);
    expect(goal?.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('region', { name: 'Daily goal and streak' })).toBeTruthy();

    fireEvent.keyDown(goal as HTMLElement, { key: 'End' });
    expect(document.activeElement).toBe(history);
    fireEvent.keyDown(history as HTMLElement, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(shop);
    fireEvent.keyDown(shop as HTMLElement, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(history);
    fireEvent.keyDown(history as HTMLElement, { key: 'Home' });
    expect(document.activeElement).toBe(shop);
  });

  it('shows the history under its own heading, grouped by day', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: 'History' }));
    expect(screen.getByRole('heading', { name: 'History' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Today' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Yesterday' })).toBeTruthy();
    expect(screen.getByText('Focus session')).toBeTruthy();
    expect(screen.getByText('+25')).toBeTruthy();
    expect(screen.getByText('Daily goal reached')).toBeTruthy();
  });

  it('tucks the earning explainer into a closed disclosure', () => {
    renderPanel();
    const details = screen.getByText('How Stardust is earned').closest('details');
    expect(details).not.toBeNull();
    expect(details?.open).toBe(false);
  });
});
