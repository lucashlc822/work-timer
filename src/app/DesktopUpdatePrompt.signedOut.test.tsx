// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { APP_NAME } from '@/shared/config';
import { isAccountDbBound } from '@/shared/db';
import type { UpdaterPort } from '@/shared/runtime';

import { DesktopUpdatePrompt } from './DesktopUpdatePrompt';

// Its own file because the account store binds once per module load: here it
// is never bound, which is what the sign-in screen looks like.
describe('DesktopUpdatePrompt on the sign-in screen', () => {
  it('is still offered when no account store is open', async () => {
    expect(isAccountDbBound()).toBe(false);
    const updater: UpdaterPort = {
      isSupported: true,
      check: vi.fn(() => Promise.resolve({ version: '0.2.0', install: () => Promise.resolve() })),
    };

    render(
      <DesktopUpdatePrompt
        getUpdater={() => Promise.resolve(updater)}
        enabled
        firstCheckMs={0}
        everyMs={60_000}
      />,
    );

    // Reading `db` here would throw; reaching the notice proves it isn't read.
    expect(await screen.findByText(`${APP_NAME} 0.2.0 is ready.`)).toBeInTheDocument();
  });
});
