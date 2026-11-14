// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FinishedResult } from '../domain/timerMachine';
import { SessionResult } from './SessionResult';

afterEach(cleanup);

const finished = (outcome: 'completed' | 'cancelled'): FinishedResult => ({
  session: {
    id: 's1',
    mode: 'countdown',
    runId: null,
    runIndex: null,
    startedAt: 1_000_000,
    plannedDurationS: 60,
    seed: 'seed',
    tagId: null,
    device: 'test',
    awayMs: 0,
    togetherId: null,
    sharedId: null,
  },
  ending: { outcome, endedAt: 1_060_000, actualFocusS: outcome === 'completed' ? 60 : 20 },
  runBlocksKept: null,
  endedBy: null,
});

describe('SessionResult announcements', () => {
  it.each([
    ['completed', 'Session complete'],
    ['cancelled', 'Session ended early'],
  ] as const)('announces a %s session and lands on Done', (outcome, headline) => {
    render(<SessionResult result={finished(outcome)} error={null} onDone={() => {}} slots={{}} />);
    expect(screen.getByRole('status')).toHaveTextContent(headline);
    expect(screen.getByRole('status')).toHaveTextContent('of focus');
    expect(screen.getByRole('button', { name: 'Done' })).toHaveFocus();
  });

  it('plays its moment on a completed session, and has none on an early ending', () => {
    vi.useFakeTimers();
    try {
      const { container, unmount } = render(
        <SessionResult result={finished('completed')} error={null} onDone={() => {}} slots={{}} />,
      );
      const root = container.firstElementChild!;
      expect(root).toHaveAttribute('data-stage', 'ignite');
      expect(container.querySelector('.moment-ignite')).not.toBeNull();
      act(() => {
        vi.advanceTimersByTime(3_000);
      });
      expect(root).toHaveAttribute('data-stage', 'settled');
      expect(container.querySelector('.moment-ignite, .moment-pending')).toBeNull();
      unmount();

      const early = render(
        <SessionResult result={finished('cancelled')} error={null} onDone={() => {}} slots={{}} />,
      );
      expect(early.container.firstElementChild).not.toHaveAttribute('data-stage');
      expect(early.container.querySelector('.moment-ignite, .moment-pending')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('skips the moment on a pointer click without pressing what was under it', () => {
    const onDone = vi.fn();
    const { container } = render(
      <SessionResult result={finished('completed')} error={null} onDone={onDone} slots={{}} />,
    );
    const done = screen.getByRole('button', { name: 'Done' });
    fireEvent.click(done, { detail: 1 });
    expect(onDone).not.toHaveBeenCalled();
    expect(container.firstElementChild).toHaveAttribute('data-stage', 'settled');

    fireEvent.click(done, { detail: 1 });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('lets Enter on Done through while the moment plays', () => {
    const onDone = vi.fn();
    render(
      <SessionResult result={finished('completed')} error={null} onDone={onDone} slots={{}} />,
    );
    // A keyboard activation is a click with detail 0.
    fireEvent.click(screen.getByRole('button', { name: 'Done' }), { detail: 0 });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('waits while the timer is covered by another view', () => {
    const { container } = render(
      <SessionResult
        result={finished('completed')}
        error={null}
        onDone={() => {}}
        slots={{}}
        present={false}
      />,
    );
    expect(container.firstElementChild).toHaveAttribute('data-stage', 'waiting');
    // Still announced and focused from the first frame.
    expect(screen.getByRole('status')).toHaveTextContent('Session complete');
    expect(screen.getByRole('button', { name: 'Done' })).toHaveFocus();
  });

  it('announces an error as an alert', () => {
    render(
      <SessionResult
        result={finished('completed')}
        error="Couldn't save"
        onDone={() => {}}
        slots={{}}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't save");
  });
});
