// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { bindAccountDb, db, type SessionRow } from '@/shared/db';

import { RewardSummary, RewardTally } from './RewardTally';

const USER = '11111111-1111-4111-8111-111111111111';
/** Mid-afternoon, so no session here crosses midnight whenever the suite runs. */
const NOW = new Date(2026, 10, 13, 15).getTime();

const session = (id: string, minutes: number, startedAt: number): SessionRow => ({
  id,
  mode: 'countdown',
  plannedDurationS: minutes * 60,
  actualFocusS: minutes * 60,
  startedAt,
  endedAt: startedAt + minutes * 60_000,
  outcome: 'completed',
  awayMs: 0,
  tagId: null,
  seed: id,
  device: 'test',
  clientCreatedAt: startedAt,
  syncedAt: null,
});

beforeAll(() => {
  bindAccountDb('reward-tally-test');
});

beforeEach(() => {
  // Only Date: Dexie's live queries need real timers.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(async () => {
  vi.useRealTimers();
  cleanup();
  await db.sessions.clear();
  await db.ledger.clear();
});

describe('RewardTally', () => {
  it('shows one total for a session that earned only its own Stardust, hidden from AT', async () => {
    await db.sessions.put(session('a', 25, NOW - 26 * 60_000));
    const { container } = render(<RewardTally userId={USER} sessionIds={['a']} instant />);
    const total = await screen.findByTestId('reward-total');
    expect(total).toHaveTextContent('+25 Stardust');
    expect(total.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(container.querySelector('li')).toBeNull();
  });

  it('itemises a goal bonus, and the summary says it in one sentence', async () => {
    const start = NOW - 70 * 60_000;
    await db.sessions.bulkPut([session('early', 40, start), session('b', 25, start + 41 * 60_000)]);
    render(
      <>
        <RewardTally userId={USER} sessionIds={['b']} instant />
        <RewardSummary userId={USER} sessionIds={['b']} />
      </>,
    );
    await waitFor(() => expect(screen.getByTestId('reward-total')).toHaveTextContent('+45'));
    // Hidden from AT, so found by tag rather than by role.
    expect([...document.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      'Focus · 25 min+25',
      'Daily goal reached+20',
    ]);
    expect(screen.getByText(/Earned 45 Stardust/)).toHaveClass('sr-only');
  });

  it('keeps its lines waiting until the moment reaches the tally', async () => {
    await db.sessions.put(session('c', 25, NOW - 26 * 60_000));
    const { rerender } = render(<RewardTally userId={USER} sessionIds={['c']} reveal={false} />);
    const total = await screen.findByTestId('reward-total');
    expect(total).toHaveClass('moment-pending');
    rerender(<RewardTally userId={USER} sessionIds={['c']} reveal />);
    expect(total).not.toHaveClass('moment-pending');
  });

  it('renders nothing for an early ending', async () => {
    await db.sessions.put({ ...session('d', 10, NOW - 11 * 60_000), outcome: 'cancelled' });
    const { container } = render(<RewardTally userId={USER} sessionIds={['d']} instant />);
    await new Promise((r) => setTimeout(r, 50));
    expect(container).toBeEmptyDOMElement();
  });
});
