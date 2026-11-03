// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { bindAccountDb, db } from '@/shared/db';

import type { TimerSlots } from './slots';
import { TimerProvider } from './TimerProvider';
import { TimerScreen } from './TimerScreen';

beforeAll(() => {
  bindAccountDb('timer-screen-test');
});

beforeEach(async () => {
  await db.sessions.clear();
  await db.meta.clear();
});

const renderScreen = (slots: TimerSlots) =>
  render(
    <TimerProvider>
      <TimerScreen slots={slots} />
    </TimerProvider>,
  );

describe('TimerScreen slots (M7: focus together)', () => {
  it('idleOverride takes the place of the start controls', async () => {
    renderScreen({ idleOverride: () => <p>In a lobby</p> });
    await screen.findByText('In a lobby');
    expect(screen.queryByRole('button', { name: /^Start/ })).toBeNull();
  });

  it('a null idleOverride leaves the start controls alone', async () => {
    renderScreen({ idleOverride: () => null });
    await screen.findByRole('button', { name: /^Start \d+ min$/ });
  });

  it('beforeStart answering no starts nothing; yes starts the session', async () => {
    const user = userEvent.setup();
    let answer = false;
    const beforeStart = vi.fn(() => Promise.resolve(answer));
    renderScreen({ beforeStart });

    await user.click(await screen.findByRole('button', { name: /^Start \d+ min$/ }));
    expect(beforeStart).toHaveBeenCalledTimes(1);
    expect(await db.sessions.count()).toBe(0);
    await screen.findByRole('button', { name: /^Start \d+ min$/ });

    answer = true;
    await user.click(screen.getByRole('button', { name: /^Start \d+ min$/ }));
    await screen.findByRole('button', { name: 'End early' });
    expect(await db.sessions.count()).toBe(1);
  });
});
