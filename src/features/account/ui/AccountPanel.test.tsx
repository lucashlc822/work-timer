// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_VERSION } from '@/shared/config';
import { bindAccountDb, db, META_KEYS, writeMeta } from '@/shared/db';

import { AccountPanel } from './AccountPanel';

beforeAll(() => {
  bindAccountDb('account-panel-test');
});

beforeEach(async () => {
  await db.meta.clear();
});

const renderPanel = () =>
  render(
    <AccountPanel
      email="a@test.local"
      sync={{ phase: 'synced', lastSyncedAt: null, pending: 0, rejected: 0 }}
      onSyncNow={vi.fn()}
      onSignOut={vi.fn(() => Promise.resolve())}
      onDeleteAccount={vi.fn(() => Promise.resolve())}
    />,
  );

describe('AccountPanel', () => {
  it('shows which version of the app this is', () => {
    renderPanel();

    expect(screen.getByText(`Starkeep ${APP_VERSION}`)).toBeInTheDocument();
  });

  it('lets the person sign out when nothing is running', () => {
    renderPanel();

    expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled();
  });

  // The pointers the timer keeps in `meta` are the only thing this feature
  // knows about a session in progress (via `hasWorkInFlight`).
  it('blocks signing out, with the reason, while a session is running', async () => {
    await writeMeta(db, META_KEYS.activeSessionId, 'running');

    renderPanel();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign out' })).toBeDisabled());
    expect(
      screen.getByText('Finish or end the session in progress before signing out.'),
    ).toBeInTheDocument();
  });

  it('blocks signing out during a Pomodoro run', async () => {
    await writeMeta(db, META_KEYS.activeRun, { id: 'run', break: null });

    renderPanel();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign out' })).toBeDisabled());
  });
});
