// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { useDialogFocus, useFocusHeading, useFocusIfLost } from './focus';

afterEach(cleanup);

const Dialog = ({ onClose }: { onClose: () => void }) => {
  const box = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  useDialogFocus(box, first);
  return (
    <div ref={box} role="dialog">
      <button ref={first} onClick={onClose}>
        Keep going
      </button>
      <button>End session</button>
    </div>
  );
};

const Page = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>End early</button>
      <button>Behind</button>
      {open && <Dialog onClose={() => setOpen(false)} />}
    </>
  );
};

describe('useDialogFocus', () => {
  it('focuses the initial control and keeps Tab inside the dialog', async () => {
    const user = userEvent.setup();
    render(<Page />);
    await user.click(screen.getByText('End early'));
    expect(screen.getByText('Keep going')).toHaveFocus();

    await user.tab();
    expect(screen.getByText('End session')).toHaveFocus();
    await user.tab();
    expect(screen.getByText('Keep going')).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByText('End session')).toHaveFocus();
  });

  it('hands focus back to the opener on close', async () => {
    const user = userEvent.setup();
    render(<Page />);
    await user.click(screen.getByText('End early'));
    await user.click(screen.getByText('Keep going'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('End early')).toHaveFocus();
  });
});

const Swap = ({ second }: { second: boolean }) => {
  const done = useRef<HTMLButtonElement>(null);
  useFocusIfLost(done, second);
  return second ? <button ref={done}>Done</button> : <button>Start</button>;
};

describe('useFocusIfLost', () => {
  it('lands on the target when the focused control was replaced', () => {
    const { rerender } = render(<Swap second={false} />);
    screen.getByText('Start').focus();
    rerender(<Swap second />);
    expect(screen.getByText('Done')).toHaveFocus();
  });

  it('never takes focus from something that still has it', () => {
    const { rerender } = render(
      <>
        <input aria-label="elsewhere" />
        <Swap second={false} />
      </>,
    );
    screen.getByLabelText('elsewhere').focus();
    rerender(
      <>
        <input aria-label="elsewhere" />
        <Swap second />
      </>,
    );
    expect(screen.getByLabelText('elsewhere')).toHaveFocus();
  });
});

const Panel = ({ headings }: { headings: string[] }) => {
  const body = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  useFocusHeading(body, back);
  return (
    <>
      <div ref={body}>
        {headings.map((h) => (
          <h2 key={h} tabIndex={-1}>
            {h}
          </h2>
        ))}
        <button>First control</button>
      </div>
      <button ref={back}>Back</button>
    </>
  );
};

describe('useFocusHeading', () => {
  it('focuses the panel title on mount, taking focus from the opener', () => {
    render(
      <>
        <button>Opener</button>
        <Panel headings={['Stats']} />
      </>,
    );
    expect(screen.getByRole('heading', { name: 'Stats' })).toHaveFocus();
  });

  it('leaves the first control one Tab away', async () => {
    const user = userEvent.setup();
    render(<Panel headings={['Stats']} />);
    await user.tab();
    expect(screen.getByText('First control')).toHaveFocus();
  });

  it('focuses only the first heading', () => {
    render(<Panel headings={['Stats', 'Other']} />);
    expect(screen.getByRole('heading', { name: 'Stats' })).toHaveFocus();
  });

  it('falls back to the given control when there is no heading', () => {
    render(<Panel headings={[]} />);
    expect(screen.getByText('Back')).toHaveFocus();
  });
});
