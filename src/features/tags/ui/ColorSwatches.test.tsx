// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import type { TagColor } from '@/shared/db';
import { TAG_COLORS } from '@/shared/ui';

import { ColorSwatches } from './ColorSwatches';

afterEach(cleanup);

const Harness = ({ initial }: { initial: TagColor }) => {
  const [color, setColor] = useState<TagColor>(initial);
  return (
    <>
      <button>before</button>
      <ColorSwatches label="Colour" value={color} onChange={setColor} />
      <button>after</button>
    </>
  );
};

const dot = (color: string) => screen.getByRole('radio', { name: color });
const first = TAG_COLORS[0]!;
const second = TAG_COLORS[1]!;
const last = TAG_COLORS[TAG_COLORS.length - 1]!;

describe('ColorSwatches', () => {
  it('makes the chosen dot the only Tab stop', async () => {
    const user = userEvent.setup();
    render(<Harness initial={second} />);
    for (const color of TAG_COLORS) {
      expect(dot(color)).toHaveAttribute('tabindex', color === second ? '0' : '-1');
    }

    await user.click(screen.getByText('before'));
    await user.tab();
    expect(dot(second)).toHaveFocus();
    await user.tab();
    expect(screen.getByText('after')).toHaveFocus();
  });

  it('moves and chooses with the arrow keys, wrapping at the ends', async () => {
    const user = userEvent.setup();
    render(<Harness initial={first} />);
    dot(first).focus();

    await user.keyboard('{ArrowRight}');
    expect(dot(second)).toHaveFocus();
    expect(dot(second)).toHaveAttribute('aria-checked', 'true');
    expect(dot(first)).toHaveAttribute('aria-checked', 'false');

    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(dot(last)).toHaveFocus();
    expect(dot(last)).toHaveAttribute('aria-checked', 'true');
    await user.keyboard('{ArrowRight}');
    expect(dot(first)).toHaveFocus();
  });
});
