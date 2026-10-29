// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';

import { bindAccountDb } from '@/shared/db';

import { TagPicker } from './TagPicker';

beforeAll(() => {
  bindAccountDb('tag-picker-test');
});

const Harness = () => {
  const [value, setValue] = useState<string | null>(null);
  return (
    <>
      <TagPicker value={value} onChange={setValue} />
      <button>elsewhere</button>
    </>
  );
};

const pill = () => screen.getByRole('button', { name: 'No tag', expanded: false });
const panel = () => screen.queryByRole('dialog', { name: 'Choose a tag' });
const option = () => screen.getByRole('button', { name: 'No tag', pressed: true });

describe('the tag picker keeps focus on its pill', () => {
  it('after an option is picked with the keyboard', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(pill());
    option().focus();
    await user.keyboard('{Enter}');

    expect(panel()).toBeNull();
    expect(pill()).toHaveFocus();
  });

  it('after an option is clicked', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(pill());
    await user.click(option());

    expect(panel()).toBeNull();
    expect(pill()).toHaveFocus();
  });

  it('after Escape from inside the panel', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(pill());
    option().focus();
    await user.keyboard('{Escape}');

    expect(panel()).toBeNull();
    expect(pill()).toHaveFocus();
  });

  it('but leaves focus alone when the panel closes from a press outside', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(pill());
    await user.click(screen.getByText('elsewhere'));

    expect(panel()).toBeNull();
    expect(screen.getByText('elsewhere')).toHaveFocus();
  });
});
