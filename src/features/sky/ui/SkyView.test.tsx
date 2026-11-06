// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { StarDetails } from '../data/starDetails';
import { deriveSky } from '../domain/derive';
import { deriveShared } from '../domain/shared';
import { tierRules } from '../domain/tiers';
import type { CompletedSession, ConstellationChoice } from '../domain/types';
import { CARD_GRACE_MS, SkyView } from './SkyBackdrop';

// The ambient field is a canvas, which jsdom can't draw; the stars are what's under test.
vi.mock('./AmbientCanvas', () => ({ AmbientCanvas: () => null }));

/** jsdom has no ResizeObserver: report a fixed window so the sky lays out. */
class FixedSizeObserver {
  private readonly callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe() {
    this.callback([{ contentRect: { width: 1000, height: 700 } } as ResizeObserverEntry], this);
  }
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', FixedSizeObserver);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const T0 = Date.UTC(2026, 10, 2, 20, 0);
const HOUR = 3_600_000;
const star = (i: number, extra: Partial<CompletedSession> = {}): CompletedSession => ({
  id: `s${i}`,
  seed: `seed-${i}`,
  startedAt: T0 + i * HOUR - 25 * 60_000,
  endedAt: T0 + i * HOUR,
  actualFocusS: 25 * 60,
  ...extra,
});
const kite: ConstellationChoice = {
  id: 'c-kite',
  source: 'catalogue',
  shapeId: 'kite',
  seed: null,
  tier: 'easy',
  chosenAt: T0,
};
const rules = tierRules(false);
const sky = () => deriveSky([star(1, { starStyle: 'ember' }), star(2)], [kite], rules);

const details = new Map<string, StarDetails>([
  [
    's1',
    {
      tag: { name: 'Writing', color: 'mint' },
      run: { index: 2, total: 3 },
      together: null,
    },
  ],
  ['s2', { tag: null, run: null, together: { names: ['mia'] } }],
]);

const styleName = (key: string | undefined) => (key === 'ember' ? 'Ember' : 'Classic');

const stars = () => screen.getAllByRole('img', { name: /star from/i });
const captions = () => screen.getAllByRole('img', { name: /^The / });
const constellationCard = () => screen.queryByTestId('constellation-card');
const figureOpacity = (id: string) =>
  document.querySelector<SVGElement>(`[data-figure="${id}"]`)?.style.opacity;
const card = () => screen.queryByTestId('star-card');

type ViewProps = Parameters<typeof SkyView>[0];
const renderSky = (props: Partial<ViewProps> = {}, withDetails = true) =>
  render(
    <SkyView
      sky={sky()}
      themeKey={undefined}
      mode="full"
      {...(withDetails && { details })}
      styleName={styleName}
      {...props}
    />,
  );

describe('the star card', () => {
  it('shows when a star is hovered, with its tag, Pomodoro block and style', () => {
    renderSky();

    fireEvent.pointerEnter(stars()[0]!);

    const shown = card();
    expect(shown).not.toBeNull();
    expect(shown!.textContent).toContain('Writing');
    expect(shown!.textContent).toContain('Pomodoro block 2 of 3');
    expect(shown!.textContent).toContain('Ember star');
    expect(shown!.textContent).toContain('25 minutes');
    // Visual only: a screen reader gets the same words from the star itself.
    expect(shown!.getAttribute('aria-hidden')).toBe('true');
    expect(shown!.querySelector('[tabindex]')).toBeNull();
  });

  it('says who you focused with', () => {
    renderSky();
    fireEvent.pointerEnter(stars()[1]!);
    expect(card()!.textContent).toContain('Focused with mia');
  });

  it('stays for a moment after the pointer leaves, and stays while the pointer is on it', () => {
    vi.useFakeTimers();
    renderSky();

    fireEvent.pointerEnter(stars()[0]!);
    fireEvent.pointerLeave(stars()[0]!);
    act(() => {
      vi.advanceTimersByTime(CARD_GRACE_MS - 50);
    });
    expect(card()).not.toBeNull();

    // Reaching the card in time keeps it (WCAG 1.4.13, hoverable).
    fireEvent.pointerEnter(card()!);
    act(() => {
      vi.advanceTimersByTime(CARD_GRACE_MS * 4);
    });
    expect(card()).not.toBeNull();

    fireEvent.pointerLeave(card()!);
    act(() => {
      vi.advanceTimersByTime(CARD_GRACE_MS + 10);
    });
    expect(card()).toBeNull();
  });

  it('shows on keyboard focus and goes on blur', () => {
    renderSky();

    fireEvent.focus(stars()[0]!);
    expect(card()).not.toBeNull();

    fireEvent.blur(stars()[0]!);
    expect(card()).toBeNull();
  });

  it('swaps straight to the next star without closing', () => {
    vi.useFakeTimers();
    renderSky();

    fireEvent.pointerEnter(stars()[0]!);
    fireEvent.pointerLeave(stars()[0]!);
    fireEvent.pointerEnter(stars()[1]!);
    act(() => {
      vi.advanceTimersByTime(CARD_GRACE_MS * 2);
    });

    expect(card()!.textContent).toContain('Focused with mia');
  });

  it('closes on the first Escape without leaving the sky, and lets the second one through', () => {
    const leaveSky = vi.fn();
    document.addEventListener('keydown', leaveSky);
    try {
      renderSky();
      fireEvent.focus(stars()[0]!);

      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(card()).toBeNull();
      expect(leaveSky).not.toHaveBeenCalled();

      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(leaveSky).toHaveBeenCalledTimes(1);
    } finally {
      document.removeEventListener('keydown', leaveSky);
    }
  });

  it('gives every star a description of its card instead of a browser tooltip', () => {
    const { container } = renderSky();

    expect(container.querySelector('title')).toBeNull();
    const desc = stars()[0]!.querySelector('desc');
    expect(desc?.textContent).toContain('Tagged Writing.');
    expect(desc?.textContent).toContain('Pomodoro block 2 of 3.');
    expect(desc?.textContent).toContain('Ember star.');
    // The short name stays the accessible name.
    expect(stars()[0]!.getAttribute('aria-label')).toMatch(/^Star from .+, 25 minutes$/);
  });

  it("on a friend's sky, says only when, how long and which style", () => {
    renderSky({}, false);

    fireEvent.pointerEnter(stars()[0]!);

    const text = card()!.textContent ?? '';
    expect(text).toContain('25 minutes');
    expect(text).toContain('Ember star');
    expect(text).not.toContain('Writing');
    expect(text).not.toContain('Pomodoro');
  });

  it("calls a star in a shared constellation your friend's when it isn't one of yours", () => {
    const shared = deriveShared({
      id: 'sh1',
      partnerName: 'Bea',
      choice: { ...kite, id: 'sh1' },
      starsNeeded: 4,
      minFocusS: 0,
      acceptedAt: T0,
      stoppedAt: null,
      sessions: [star(7, { id: 'theirs' })],
    });
    renderSky({ sky: deriveSky([], [], rules), shared: [shared] });

    fireEvent.pointerEnter(stars()[0]!);

    expect(card()!.textContent).toContain('Bea’s star');
  });

  it('never shows in hero mode, where the sky is only a backdrop', () => {
    const { container } = renderSky({ mode: 'hero' });
    expect(screen.queryAllByRole('img')).toHaveLength(0);
    expect(container.querySelector('desc')).toBeNull();
  });
});

describe('the constellation card', () => {
  const arrow: ConstellationChoice = {
    ...kite,
    id: 'c-arrow',
    shapeId: 'arrow',
    chosenAt: T0 + 10 * HOUR,
  };
  /** A finished Kite, then an Arrow with one star. */
  const twoFigures = () =>
    deriveSky([star(1), star(2), star(3), star(4), star(11)], [kite, arrow], rules);
  const figure = (id: string) => document.querySelector(`[data-figure="${id}"]`)!;

  it('shows when a constellation is hovered, and dims the others', () => {
    renderSky({ sky: twoFigures() });

    fireEvent.pointerEnter(figure('c-kite'));

    expect(constellationCard()!.textContent).toContain('The Kite');
    expect(constellationCard()!.textContent).toMatch(/Complete on /);
    expect(constellationCard()!.textContent).toContain('Started ');
    expect(constellationCard()!.textContent).toContain('1 h 40 min of focus');
    expect(figureOpacity('c-kite')).toBe('1');
    expect(figureOpacity('c-arrow')).toBe('0.35');
  });

  it('does not dim anything when there is only one constellation', () => {
    renderSky();
    fireEvent.pointerEnter(figure('c-kite'));
    expect(constellationCard()).not.toBeNull();
    expect(figureOpacity('c-kite')).toBe('1');
  });

  it('opens from its caption on the keyboard, a stop before its stars', () => {
    renderSky({ sky: twoFigures() });

    const caption = captions()[0]!;
    expect(caption.getAttribute('tabindex')).toBe('0');
    // The caption is the figure's first stop: it comes before the stars in the page.
    const firstStar = figure('c-kite').querySelector('[role="img"][aria-label^="Star"]')!;
    expect(
      caption.compareDocumentPosition(firstStar) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(caption.querySelector('desc')?.textContent).toMatch(
      /^Complete on .+\. Started .+\. 1 h 40 min of focus\.$/,
    );

    fireEvent.focus(caption);
    expect(constellationCard()!.textContent).toContain('The Kite');
    expect(figureOpacity('c-arrow')).toBe('0.35');

    fireEvent.blur(caption);
    expect(constellationCard()).toBeNull();
    expect(figureOpacity('c-arrow')).toBe('1');
  });

  it('gives way to the card of a star inside it, and stays bright meanwhile', () => {
    renderSky({ sky: twoFigures() });

    fireEvent.pointerEnter(figure('c-kite'));
    fireEvent.pointerEnter(stars()[0]!);

    expect(card()).not.toBeNull();
    expect(constellationCard()).toBeNull();
    expect(figureOpacity('c-arrow')).toBe('0.35');
  });

  it('keeps the constellation of a focused star bright too', () => {
    renderSky({ sky: twoFigures() });
    fireEvent.focus(stars()[4]!); // the Arrow's star
    expect(figureOpacity('c-kite')).toBe('0.35');
    expect(figureOpacity('c-arrow')).toBe('1');
  });

  it('closes on the first Escape and undims, and lets the second one leave', () => {
    const leaveSky = vi.fn();
    document.addEventListener('keydown', leaveSky);
    try {
      renderSky({ sky: twoFigures() });
      fireEvent.focus(captions()[0]!);

      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(constellationCard()).toBeNull();
      expect(figureOpacity('c-arrow')).toBe('1');
      expect(leaveSky).not.toHaveBeenCalled();

      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(leaveSky).toHaveBeenCalledTimes(1);
    } finally {
      document.removeEventListener('keydown', leaveSky);
    }
  });

  it('lingers after the pointer leaves the figure, like the star card', () => {
    vi.useFakeTimers();
    renderSky({ sky: twoFigures() });

    fireEvent.pointerEnter(figure('c-kite'));
    fireEvent.pointerLeave(figure('c-kite'));
    act(() => {
      vi.advanceTimersByTime(CARD_GRACE_MS - 50);
    });
    expect(constellationCard()).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(constellationCard()).toBeNull();
    expect(figureOpacity('c-arrow')).toBe('1');
  });
});

describe('the completion announcement', () => {
  const finishedKite = () => deriveSky([star(1), star(2), star(3), star(4)], [kite], rules);
  const announcer = () => screen.getByTestId('sky-announcer');

  it('says, politely and once, which constellation is complete', () => {
    renderSky({ sky: finishedKite(), celebrating: new Map([['c-kite', 0]]) });
    expect(announcer().getAttribute('aria-live')).toBe('polite');
    expect(announcer().textContent).toBe('The Kite is complete.');
  });

  it('says nothing when nothing is celebrating, and the region is there before it speaks', () => {
    renderSky({ sky: finishedKite(), celebrating: new Map() });
    expect(announcer().textContent).toBe('');
  });

  it('has no announcer behind the timer', () => {
    renderSky({ sky: finishedKite(), mode: 'hero', celebrating: new Map([['c-kite', 0]]) });
    expect(screen.queryByTestId('sky-announcer')).toBeNull();
  });
});
