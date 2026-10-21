// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CountdownDisplay, ProgressBar } from './CountdownDisplay';

afterEach(cleanup);

describe('the progress bar has a name a screen reader can say', () => {
  it('a session bar is "Session progress"', () => {
    render(<CountdownDisplay remainingMs={600_000} progress={0.4} />);
    expect(screen.getByRole('progressbar', { name: 'Session progress' })).toHaveAttribute(
      'aria-valuenow',
      '40',
    );
  });

  it('a break can name its own', () => {
    render(<CountdownDisplay remainingMs={60_000} progress={0.5} label="Break progress" />);
    expect(screen.getByRole('progressbar', { name: 'Break progress' })).toBeInTheDocument();
  });

  it('the bare bar used by the mini window is named too', () => {
    render(<ProgressBar progress={0} />);
    expect(screen.getByRole('progressbar', { name: 'Session progress' })).toBeInTheDocument();
  });
});
