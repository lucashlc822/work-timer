// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { SegmentedControl } from './SegmentedControl';

afterEach(cleanup);

const OPTIONS = [
  { value: 25, label: '25 min' },
  { value: 50, label: '50 min' },
  { value: 90, label: '90 min' },
] as const;

const Harness = ({
  initial = 25,
  disabled = false,
}: {
  initial?: number | null;
  disabled?: boolean;
}) => {
  const [value, setValue] = useState<number | null>(initial);
  return (
    <>
      <button>before</button>
      <SegmentedControl
        label="Session length"
        options={OPTIONS}
        value={value}
        onChange={setValue}
        disabled={disabled}
      />
      <button>after</button>
    </>
  );
};

const radio = (name: string) => screen.getByRole('radio', { name });

describe('SegmentedControl', () => {
  it('makes the selected segment the only Tab stop', async () => {
    const user = userEvent.setup();
    render(<Harness initial={50} />);
    expect(radio('50 min')).toHaveAttribute('tabindex', '0');
    expect(radio('25 min')).toHaveAttribute('tabindex', '-1');
    expect(radio('90 min')).toHaveAttribute('tabindex', '-1');

    await user.click(screen.getByText('before'));
    await user.tab();
    expect(radio('50 min')).toHaveFocus();
    await user.tab();
    expect(screen.getByText('after')).toHaveFocus();
  });

  it('is still reachable, at its first segment, when nothing is selected', async () => {
    const user = userEvent.setup();
    render(<Harness initial={null} />);
    expect(radio('25 min')).toHaveAttribute('tabindex', '0');
    expect(radio('50 min')).toHaveAttribute('tabindex', '-1');

    await user.click(screen.getByText('before'));
    await user.tab();
    expect(radio('25 min')).toHaveFocus();
  });

  it('moves and selects with the arrow keys, wrapping at the ends', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    radio('25 min').focus();

    await user.keyboard('{ArrowRight}');
    expect(radio('50 min')).toHaveFocus();
    expect(radio('50 min')).toHaveAttribute('aria-checked', 'true');
    expect(radio('25 min')).toHaveAttribute('aria-checked', 'false');
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(radio('25 min')).toHaveFocus();
    expect(radio('25 min')).toHaveAttribute('aria-checked', 'true');
    await user.keyboard('{ArrowLeft}');
    expect(radio('90 min')).toHaveFocus();
    expect(radio('90 min')).toHaveAttribute('aria-checked', 'true');
  });

  it('answers Down and Up as well, for a group that wraps onto rows', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    radio('25 min').focus();

    await user.keyboard('{ArrowDown}');
    expect(radio('50 min')).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(radio('25 min')).toHaveFocus();
    expect(radio('25 min')).toHaveAttribute('aria-checked', 'true');
  });

  it('keeps one Tab stop as the selection moves', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    radio('25 min').focus();
    await user.keyboard('{ArrowRight}');
    expect(radio('50 min')).toHaveAttribute('tabindex', '0');
    expect(radio('25 min')).toHaveAttribute('tabindex', '-1');
  });

  it('selects on Space, and leaves other keys alone', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    radio('90 min').focus();

    await user.keyboard('x');
    expect(radio('90 min')).toHaveAttribute('aria-checked', 'false');
    await user.keyboard(' ');
    expect(radio('90 min')).toHaveAttribute('aria-checked', 'true');
  });

  it('cannot be focused or changed when disabled', async () => {
    const user = userEvent.setup();
    render(<Harness disabled />);
    for (const name of ['25 min', '50 min', '90 min']) expect(radio(name)).toBeDisabled();

    await user.click(screen.getByText('before'));
    await user.tab();
    expect(screen.getByText('after')).toHaveFocus();
    await user.click(radio('50 min'));
    expect(radio('25 min')).toHaveAttribute('aria-checked', 'true');
  });
});
