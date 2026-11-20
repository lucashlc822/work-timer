// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SLOW_SYNC_MS, SyncStatus, type SyncStatusView } from './SyncStatus';

const status = (over: Partial<SyncStatusView> = {}): SyncStatusView => ({
  phase: 'syncing',
  lastSyncedAt: null,
  pending: 0,
  rejected: 0,
  ...over,
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('SyncStatus while a round runs (UI review M5)', () => {
  it('says "Syncing…" at first', () => {
    render(<SyncStatus status={status()} onSyncNow={() => {}} />);
    expect(screen.getByRole('status')).toHaveTextContent('Syncing…');
  });

  it('says it is still trying to reach the server once the round has dragged on', () => {
    render(<SyncStatus status={status({ pending: 2 })} onSyncNow={() => {}} />);
    act(() => void vi.advanceTimersByTime(SLOW_SYNC_MS - 1));
    expect(screen.getByRole('status')).toHaveTextContent('Syncing…');
    act(() => void vi.advanceTimersByTime(1));
    expect(screen.getByRole('status')).toHaveTextContent(
      'Still trying to reach the server… · 2 changes waiting',
    );
  });

  it('settles on the real outcome, and the next round starts its wait again', () => {
    const { rerender } = render(<SyncStatus status={status()} onSyncNow={() => {}} />);
    act(() => void vi.advanceTimersByTime(SLOW_SYNC_MS));
    rerender(<SyncStatus status={status({ phase: 'unreachable' })} onSyncNow={() => {}} />);
    expect(screen.getByRole('status')).toHaveTextContent("Couldn't reach the server");
    rerender(<SyncStatus status={status()} onSyncNow={() => {}} />);
    expect(screen.getByRole('status')).toHaveTextContent('Syncing…');
  });

  it('keeps Sync now disabled while syncing, slow or not', () => {
    render(<SyncStatus status={status()} onSyncNow={() => {}} />);
    act(() => void vi.advanceTimersByTime(SLOW_SYNC_MS));
    expect(screen.getByRole('button', { name: 'Sync now' })).toBeDisabled();
  });
});
