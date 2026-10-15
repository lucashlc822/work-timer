// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { bindAccountDb, db, META_KEYS, writeMeta } from '@/shared/db';
import type { AvailableUpdate, UpdaterPort } from '@/shared/runtime';

import { DesktopUpdatePrompt } from './DesktopUpdatePrompt';

beforeAll(() => {
  bindAccountDb('update-prompt-test');
});

beforeEach(async () => {
  await db.meta.clear();
});

const fakeUpdate = (install: () => Promise<void> = () => Promise.resolve()): AvailableUpdate => ({
  version: '0.2.0',
  install: vi.fn(install),
});

const fakeUpdater = (update: AvailableUpdate | null, isSupported = true) => {
  const check = vi.fn(() => Promise.resolve(update));
  const updater: UpdaterPort = { isSupported, check };
  return { updater, check };
};

/** Checks immediately instead of after the production delay. */
const renderPrompt = (updater: UpdaterPort, enabled = true) =>
  render(
    <DesktopUpdatePrompt
      getUpdater={() => Promise.resolve(updater)}
      enabled={enabled}
      firstCheckMs={0}
      everyMs={60_000}
    />,
  );

const NOTICE = 'Starkeep 0.2.0 is ready.';

describe('DesktopUpdatePrompt', () => {
  it('offers an update that exists when nothing is in progress', async () => {
    const { updater } = fakeUpdater(fakeUpdate());

    renderPrompt(updater);

    expect(await screen.findByText(NOTICE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restart to update' })).toBeEnabled();
  });

  // The whole point of a notice rather than an automatic install.
  it('stays hidden while a session is in progress, and appears when it ends', async () => {
    await writeMeta(db, META_KEYS.activeSessionId, 'running');
    const { updater, check } = fakeUpdater(fakeUpdate());

    renderPrompt(updater);
    await waitFor(() => expect(check).toHaveBeenCalled());
    // Give the notice every chance to (wrongly) appear.
    await new Promise((r) => setTimeout(r, 100));
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();

    await db.meta.delete(META_KEYS.activeSessionId);

    expect(await screen.findByText(NOTICE)).toBeInTheDocument();
  });

  it('stays hidden during a Pomodoro run, including its breaks', async () => {
    await writeMeta(db, META_KEYS.activeRun, { id: 'run', break: { kind: 'short' } });
    const { updater, check } = fakeUpdater(fakeUpdate());

    renderPrompt(updater);
    await waitFor(() => expect(check).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 100));

    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  it('"Later" hides it', async () => {
    const { updater } = fakeUpdater(fakeUpdate());
    renderPrompt(updater);
    await screen.findByText(NOTICE);

    await userEvent.click(screen.getByRole('button', { name: 'Later' }));

    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  it('"Restart to update" installs the update', async () => {
    const install = vi.fn(() => new Promise<void>(() => {})); // relaunch never returns
    const update: AvailableUpdate = { version: '0.2.0', install };
    const { updater } = fakeUpdater(update);
    renderPrompt(updater);
    await screen.findByText(NOTICE);

    await userEvent.click(screen.getByRole('button', { name: 'Restart to update' }));

    expect(install).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Updating…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restart to update' })).toBeDisabled();
  });

  it('says so when the install fails, and lets the person try again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const update = fakeUpdate(() => Promise.reject(new Error('disk full')));
    const { updater } = fakeUpdater(update);
    renderPrompt(updater);
    await screen.findByText(NOTICE);

    await userEvent.click(screen.getByRole('button', { name: 'Restart to update' }));

    expect(await screen.findByText("Couldn't update. Try again later.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restart to update' })).toBeEnabled();
  });

  it('never looks for updates when disabled (a development build)', async () => {
    const { updater, check } = fakeUpdater(fakeUpdate());

    renderPrompt(updater, false);
    await new Promise((r) => setTimeout(r, 150));

    expect(check).not.toHaveBeenCalled();
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  it('does nothing on a host without an updater', async () => {
    const { updater, check } = fakeUpdater(fakeUpdate(), false);

    renderPrompt(updater);
    await new Promise((r) => setTimeout(r, 150));

    expect(check).not.toHaveBeenCalled();
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  it('shows nothing when there is no newer version', async () => {
    const { updater, check } = fakeUpdater(null);

    renderPrompt(updater);
    await waitFor(() => expect(check).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
