// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

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
