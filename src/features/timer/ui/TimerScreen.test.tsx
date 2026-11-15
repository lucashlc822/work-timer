// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { bindAccountDb, db } from '@/shared/db';
import { createTestClock } from '@/shared/lib';

import { startSession } from '../data/sessionRepository';

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

/**
 * A session that began two hours ago and ran out while the app was closed:
 * the provider resumes straight into its result, the way a relaunch does.
 */
const finishedBeforeOpening = async (together = false) => {
  const clock = createTestClock(Date.now() - 2 * 3_600_000);
  await startSession(
    db,
    { mode: 'countdown', plannedDurationS: 1500, tagId: null },
    { clock, device: 'test' },
  );
  if (together) {
    const row = (await db.sessions.toArray())[0]!;
    await db.sessions.update(row.id, { togetherId: 'room-1' });
  }
};

describe('TimerScreen: Start another on a result (session-complete PR 3)', () => {
  it('starts the same length again, asking beforeStart first', async () => {
    await finishedBeforeOpening();
    const user = userEvent.setup();
    let answer = false;
    const beforeStart = vi.fn(() => Promise.resolve(answer));
    renderScreen({ beforeStart });

    const another = await screen.findByRole('button', { name: 'Start another · 25 min' });
    expect(screen.getByRole('button', { name: 'Done' })).toHaveFocus();

    // A click while the moment plays only skips it; then the button is pressable.
    await user.keyboard('{Escape}');
    // Declined (an invitation is waiting and she says "not now"): nothing starts.
    await user.click(another);
    expect(beforeStart).toHaveBeenCalledTimes(1);
    expect(await db.sessions.count()).toBe(1);
    expect(screen.getByRole('heading', { name: 'Session complete' })).toBeInTheDocument();

    answer = true;
    await user.click(screen.getByRole('button', { name: 'Start another · 25 min' }));
    await screen.findByRole('button', { name: 'End early' });
    const rows = await db.sessions.orderBy('startedAt').toArray();
    expect(rows).toHaveLength(2);
    expect(rows[1]!.plannedDurationS).toBe(1500);
  });

  it('is not offered after a focus-together session', async () => {
    await finishedBeforeOpening(true);
    renderScreen({});
    await screen.findByRole('heading', { name: 'Session complete' });
    expect(screen.queryByRole('button', { name: /^Start another/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
  });
});
