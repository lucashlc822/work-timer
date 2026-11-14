// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RunSummary } from './RunSummary';
import type { TimerSlots } from './slots';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const slots: TimerSlots = {
  runNote: (run, moment) => (
    <p data-testid="run-note">
      {run.sessionIds.join(',')} @ {moment.stage}
    </p>
  ),
  runSummary: () => <span className="sr-only"> Earned 50 Stardust.</span>,
};

describe('RunSummary (session-complete PR 6)', () => {
  it('plays the moment, hands the run sessions to the app note, and keeps Done focused', () => {
    const { container } = render(
      <RunSummary
        summary={{ blocks: 2, focusS: 3000, sessionIds: ['a', 'b'] }}
        onDone={() => {}}
        slots={slots}
      />,
    );
    expect(container.firstElementChild).toHaveAttribute('data-stage', 'ignite');
    expect(screen.getByTestId('run-note')).toHaveTextContent('a,b @ ignite');
    expect(screen.getByRole('status')).toHaveTextContent('2 stars this run · 50 minutes of focus');
    expect(screen.getByRole('status')).toHaveTextContent('Earned 50 Stardust.');
    expect(screen.getByRole('button', { name: 'Done' })).toHaveFocus();

    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(container.firstElementChild).toHaveAttribute('data-stage', 'settled');
    expect(screen.getByTestId('run-note')).toHaveTextContent('@ settled');
  });

  it('a click mid-moment only skips it; the next one presses Done', () => {
    const onDone = vi.fn();
    const { container } = render(
      <RunSummary summary={{ blocks: 1, focusS: 1500, sessionIds: ['a'] }} onDone={onDone} />,
    );
    const done = screen.getByRole('button', { name: 'Done' });
    fireEvent.click(done, { detail: 1 });
    expect(onDone).not.toHaveBeenCalled();
    expect(container.firstElementChild).toHaveAttribute('data-stage', 'settled');
    fireEvent.click(done, { detail: 1 });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('a run with no completed block has no moment and no note, as before', () => {
    const { container } = render(
      <RunSummary
        summary={{ blocks: 0, focusS: 0, sessionIds: [] }}
        onDone={() => {}}
        slots={slots}
      />,
    );
    expect(container.firstElementChild).not.toHaveAttribute('data-stage');
    expect(screen.queryByTestId('run-note')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('0 stars this run');
    expect(container.querySelector('.moment-ignite, .moment-pending')).toBeNull();
  });
});
