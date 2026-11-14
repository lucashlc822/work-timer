// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { bindAccountDb, db, type SessionRow } from '@/shared/db';

import { starAppearance } from '../domain/starAppearance';
import { starForm } from '../domain/starForm';
import { AstroStar } from './AstroStar';
import { RESULT_STAR_BOX, RESULT_STAR_R, RESULT_STAR_TIER, ResultStar } from './ResultStar';

beforeAll(() => {
  bindAccountDb('result-star-test');
});

afterEach(async () => {
  cleanup();
  await db.sessions.clear();
});

const session = (id: string, starStyle: string | undefined): SessionRow => ({
  id,
  mode: 'countdown',
  plannedDurationS: 1500,
  actualFocusS: 1500,
  startedAt: 1_000_000,
  endedAt: 2_500_000,
  outcome: 'completed',
  awayMs: 0,
  tagId: null,
  seed: `seed-${id}`,
  device: 'test',
  clientCreatedAt: 1_000_000,
  syncedAt: null,
  ...(starStyle === undefined ? {} : { starStyle }),
});

/** The star's drawing alone, ids stripped: what the sky's own path draws for it. */
const drawing = (html: string) => html.replace(/astro-[^"')]+/g, 'ID');

describe('the result star', () => {
  it('is the sky’s star: its stamped style, drawn by starAppearance -> starForm -> AstroStar', async () => {
    await db.sessions.put(session('s-ember', 'ember'));
    const { container } = render(
      <ResultStar sessionId="s-ember" seed="seed-s-ember" focusS={1500} />,
    );
    const svg = container.querySelector('svg')!;
    await waitFor(() => expect(svg).toHaveAttribute('data-style', 'ember'));

    const look = starAppearance('seed-s-ember', 1500, 'ember');
    const form = starForm(look, 1500, 'ember', RESULT_STAR_R, RESULT_STAR_TIER);
    const expected = renderToStaticMarkup(
      <AstroStar
        x={RESULT_STAR_BOX / 2}
        y={RESULT_STAR_BOX / 2}
        form={form}
        color={look.color}
        brightness={look.brightness}
        id="x"
      />,
    );
    expect(drawing(svg.innerHTML)).toBe(drawing(expected));
  });

  it('draws classic for a session with no stamped style', async () => {
    await db.sessions.put(session('s-plain', undefined));
    const { container } = render(
      <ResultStar sessionId="s-plain" seed="seed-s-plain" focusS={1500} />,
    );
    await waitFor(() =>
      expect(container.querySelector('svg')).toHaveAttribute('data-style', 'classic'),
    );
  });

  it('carries no filter, like every star', async () => {
    await db.sessions.put(session('s-f', 'ember'));
    const { container } = render(<ResultStar sessionId="s-f" seed="seed-s-f" focusS={1500} />);
    await waitFor(() =>
      expect(container.querySelector('svg')).toHaveAttribute('data-style', 'ember'),
    );
    expect(container.querySelector('[filter], filter')).toBeNull();
    expect(container.innerHTML).not.toContain('filter');
  });
});
