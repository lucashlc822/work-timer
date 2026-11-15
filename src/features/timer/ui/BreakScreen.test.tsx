// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_POMODORO_SETTINGS } from '@/shared/db';

import type { FinishedResult } from '../domain/timerMachine';
import type { PomodoroRun } from '../domain/types';
import { BreakScreen } from './BreakScreen';
import type { TimerSlots } from './slots';

const NOW = Date.UTC(2026, 10, 14, 10, 0, 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const run = (): PomodoroRun => ({
  id: 'run-1',
  startedAt: NOW - 25 * 60_000,
  settings: { ...DEFAULT_POMODORO_SETTINGS },
  blocksDone: 1,
  break: { kind: 'short', startedAt: NOW, durationS: 300 },
});

const result = (): FinishedResult => ({
  session: {
    id: 's1',
    mode: 'pomodoro',
    runId: 'run-1',
    runIndex: 1,
    startedAt: NOW - 25 * 60_000,
    plannedDurationS: 1500,
    seed: 'seed',
    tagId: null,
    device: 'test',
    awayMs: 0,
    togetherId: null,
    sharedId: null,
  },
  ending: { outcome: 'completed', endedAt: NOW, actualFocusS: 1500 },
  runBlocksKept: null,
  endedBy: null,
});

const slots: TimerSlots = {
  resultStar: () => <span data-testid="star" />,
  blockNote: () => <p>Added to The Kite: 1 of 4</p>,
};

const renderBreak = (over: Partial<Parameters<typeof BreakScreen>[0]> = {}) =>
  render(
    <BreakScreen
      run={run()}
      result={result()}
      error={null}
      busy={false}
      slots={slots}
      onTagChange={() => {}}
      onSkip={() => {}}
      onStartNext={() => {}}
      onEndRun={() => {}}
      {...over}
    />,
  );

describe('BreakScreen: the block lighter moment (session-complete PR 6)', () => {
  it('plays ignite, arrive, settled for a block it saw complete (case 1)', () => {
    const { container } = renderBreak();
    const block = container.querySelector('[data-stage]')!;
    expect(block).toHaveAttribute('data-stage', 'ignite');
    expect(container.querySelector('.moment-ignite')).not.toBeNull();
    // Announced at once, whatever the stage: only the look waits.
    expect(screen.getByRole('status')).toHaveTextContent('Block 1 done');
    expect(screen.getByText('Added to The Kite: 1 of 4')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(block).toHaveAttribute('data-stage', 'arrive');
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(block).toHaveAttribute('data-stage', 'settled');
    expect(container.querySelector('.moment-ignite, .moment-pending')).toBeNull();
  });

  it('sets the block note in a dark halo, clear of a figure behind it', () => {
    const { container } = renderBreak();
    expect(container.querySelector('[data-stage]')).toHaveClass('text-halo');
  });

  it('has no tally and no Start another: only the block note', () => {
    renderBreak();
    expect(screen.queryByText(/Start another/)).toBeNull();
    expect(screen.queryByTestId('reward-total')).toBeNull();
  });

  it('skips on Escape, and leaves the break buttons pressable throughout', () => {
    const onSkip = vi.fn();
    const { container } = renderBreak({ onSkip });
    // A click on Skip break is never swallowed by the moment.
    fireEvent.click(screen.getByRole('button', { name: 'Skip break' }), { detail: 1 });
    expect(onSkip).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(container.querySelector('[data-stage]')).toHaveAttribute('data-stage', 'settled');
  });

  it('has no moment for a break resumed after a reload, with no result (case 4)', () => {
    const { container } = renderBreak({ result: null });
    expect(container.querySelector('[data-stage]')).toBeNull();
    expect(container.querySelector('.moment-ignite, .moment-pending')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Short break' })).toBeInTheDocument();
  });

  it('waits while another view covers the timer', () => {
    const { container } = renderBreak({ present: false });
    expect(container.querySelector('[data-stage]')).toHaveAttribute('data-stage', 'waiting');
    expect(screen.getByRole('status')).toHaveTextContent('Block 1 done');
  });
});
