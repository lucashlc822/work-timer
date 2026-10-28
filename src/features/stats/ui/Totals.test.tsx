// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { Totals as TotalsData } from '../domain/aggregate';
import { Totals } from './Totals';

afterEach(cleanup);

const base: TotalsData = {
  focusS: 3600,
  stars: 2,
  completed: 2,
  endedEarly: 1,
  avgSessionS: 1200,
  awayMs: 0,
};

describe('the totals row', () => {
  it('is four across when nothing was away', () => {
    const { container } = render(<Totals totals={base} />);
    expect(container.querySelector('dl')).toHaveClass('sm:grid-cols-4');
    expect(screen.queryByText('Time away')).toBeNull();
  });

  it('grows to five across when there is time away, so it never sits alone', () => {
    const { container } = render(<Totals totals={{ ...base, awayMs: 90_000 }} />);
    expect(container.querySelector('dl')).toHaveClass('sm:grid-cols-5');
    // On two columns it takes the whole last row instead.
    expect(screen.getByText('Time away').parentElement).toHaveClass('col-span-2');
  });
});
