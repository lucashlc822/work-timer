// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import type { PeriodKind } from '../domain/period';
import { PeriodTabs } from './PeriodTabs';
import { PERIOD_PANEL_ID } from './periodTabIds';

afterEach(cleanup);

const Harness = () => {
  const [kind, setKind] = useState<PeriodKind>('week');
  return (
    <>
      <button>before</button>
      <PeriodTabs kind={kind} onChange={setKind} />
      <button>after</button>
    </>
  );
};

const tab = (name: string) => screen.getByRole('tab', { name });

describe('the period tabs', () => {
  it('make the selected tab the only Tab stop', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(tab('Week')).toHaveAttribute('tabindex', '0');
    expect(tab('Month')).toHaveAttribute('tabindex', '-1');
    expect(tab('All time')).toHaveAttribute('tabindex', '-1');

    await user.click(screen.getByText('before'));
    await user.tab();
    expect(tab('Week')).toHaveFocus();
    await user.tab();
    expect(screen.getByText('after')).toHaveFocus();
  });

  it('move and select with the arrow keys, wrapping at the ends', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    tab('Week').focus();

    await user.keyboard('{ArrowRight}');
    expect(tab('Month')).toHaveFocus();
    expect(tab('Month')).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowRight}');
    expect(tab('All time')).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(tab('Week')).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(tab('All time')).toHaveFocus();
    expect(tab('All time')).toHaveAttribute('aria-selected', 'true');
    expect(tab('Week')).toHaveAttribute('aria-selected', 'false');
  });

  it('jump to the first and last with Home and End', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    tab('Week').focus();
    await user.keyboard('{End}');
    expect(tab('All time')).toHaveFocus();
    await user.keyboard('{Home}');
    expect(tab('Week')).toHaveFocus();
  });

  it('each point at the panel they control', () => {
    render(<Harness />);
    for (const name of ['Week', 'Month', 'All time']) {
      expect(tab(name)).toHaveAttribute('aria-controls', PERIOD_PANEL_ID);
    }
  });
});
