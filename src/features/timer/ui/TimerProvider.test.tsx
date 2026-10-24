// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { bindAccountDb, db } from '@/shared/db';

import type { FinishedResult } from '../domain/timerMachine';
import { useTimer } from './timerContext';
import { TimerProvider } from './TimerProvider';

beforeAll(() => {
  bindAccountDb('timer-provider-test');
});

beforeEach(async () => {
  await db.sessions.clear();
  await db.meta.clear();
});

/** Stands in for the app (M7): drives the shared timer from outside the screen. */
const Driver = () => {
  const timer = useTimer();
  return (
    <div>
      <p>status: {timer.status}</p>
      <button
        type="button"
        onClick={() =>
          timer.start({
            mode: 'countdown',
            plannedDurationS: 1500,
            tagId: null,
            together: { roomId: 'room-1', startsAt: Date.now() - 2_000 },
          })
        }
      >
        start together
      </button>
      <button type="button" onClick={() => timer.confirmCancel({ endedBy: 'Bea' })}>
        friend cancels
      </button>
      <button type="button" onClick={timer.dismiss}>
        dismiss
      </button>
    </div>
  );
};

describe('TimerProvider (M7)', () => {
  it('lets the app start a together session, end it, and hear about it exactly once', async () => {
    const onEnded = vi.fn<(result: FinishedResult) => void>();
    const user = userEvent.setup();
    const { rerender } = render(
      <TimerProvider onEnded={onEnded}>
        <Driver />
      </TimerProvider>,
    );

    await screen.findByText('status: idle');
    await user.click(screen.getByRole('button', { name: 'start together' }));
    await screen.findByText('status: running');
    await user.click(screen.getByRole('button', { name: 'friend cancels' }));
    await screen.findByText('status: finished');

    await waitFor(() => expect(onEnded).toHaveBeenCalledTimes(1));
    const result = onEnded.mock.calls[0]![0];
    expect(result.ending.outcome).toBe('cancelled');
    expect(result.endedBy).toBe('Bea');
    expect(result.session.togetherId).toBe('room-1');

    // Re-rendering, then dismissing, never reports the same ending again.
    rerender(
      <TimerProvider onEnded={onEnded}>
        <Driver />
      </TimerProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'dismiss' }));
    await screen.findByText('status: idle');
    expect(onEnded).toHaveBeenCalledTimes(1);

    // And the ended session is on disk with its room.
    const [row] = await db.sessions.toArray();
    expect(row).toMatchObject({ outcome: 'cancelled', togetherId: 'room-1' });
  });
});
