import type { ReactNode, RefObject } from 'react';

import { TimerGlance } from '@/features/timer';
import { APP_NAME } from '@/shared/config';
import { StarMark } from '@/shared/ui';

const GLANCE_ID = 'home-timer-glance';

/** The app's name, at the top of home. */
export const Brand = () => (
  <header className="flex items-center gap-2">
    <StarMark size={28} />
    <h1 className="text-ink-secondary text-sm tracking-widest uppercase">{APP_NAME}</h1>
  </header>
);

/**
 * Home: where you are, and the one big thing to do (premium motion PR 5).
 *
 * Top to bottom: a greeting, the constellation you are building (drawn by the
 * sky into the slot below the greeting, which this page measures), how it is
 * going, today's goal, streak and Stardust, who is around, and the call to
 * action. The call to action starts focusing; while a session, a break or a lobby
 * is in progress it returns to it instead, and says what the timer is doing
 * ("Focusing · 18 min left") at minute resolution, so home never repaints every
 * second.
 *
 * One column; from `lg` (a wide window) two, the constellation on the left and
 * everything else in one column on the right, centred on it, with the pair
 * centred in the page and the navigation at the bottom. The greeting is still
 * read first: the slot before it is decorative.
 */
export const HomePage = ({
  busy,
  ctaRef,
  heroSlotRef,
  greetingText,
  constellation,
  tiles,
  friends,
  onFocus,
  footer,
}: {
  /** A session, a break, a result or a lobby is in progress on the timer page. */
  busy: boolean;
  ctaRef: RefObject<HTMLButtonElement | null>;
  /** The space the sky draws the constellation in; measured by the app. */
  heroSlotRef: RefObject<HTMLDivElement | null>;
  greetingText: string;
  constellation: ReactNode;
  tiles: ReactNode;
  friends: ReactNode;
  onFocus: () => void;
  footer: ReactNode;
}) => (
  <>
    {/* `lg:flex-1` + `content-center`: in a wide window the pair sits in the
        middle of the room between the name and the navigation, which stays at
        the bottom as it does in a narrow one (UI review M1). */}
    <section
      data-home-layout
      className="flex min-h-0 w-full max-w-md flex-1 flex-col items-center gap-3 lg:grid lg:max-w-4xl lg:grid-cols-2 lg:content-center lg:items-center lg:gap-x-16"
    >
      {/* Decorative, so its place in the source doesn't change the reading
          order; it comes first so that from `lg` it can be the left column. */}
      <div
        ref={heroSlotRef}
        aria-hidden
        data-hero-slot="home"
        className="lg:tall:h-120 min-h-0 w-full flex-1 lg:h-96 lg:flex-none"
      />
      {/* One column, centred on the figure from `lg`. Narrower, `contents`
          leaves its children in the page's own column, the greeting first. */}
      <div
        data-home-column
        className="contents lg:flex lg:w-full lg:flex-col lg:items-center lg:gap-4"
      >
        <h2 className="text-ink-primary order-first text-lg lg:order-none">{greetingText}</h2>
        <div>{constellation}</div>
        <div className="flex w-full max-w-md gap-2">{tiles}</div>
        <div className="flex min-h-6 items-center justify-center">{friends}</div>
        <button
          ref={ctaRef}
          type="button"
          onClick={onFocus}
          aria-describedby={busy ? GLANCE_ID : undefined}
          className="rounded-pill bg-lavender-400 text-night-900 hover:bg-lavender-300 shadow-lavender-400/25 hover:shadow-lavender-400/40 pressable px-12 py-3.5 text-base font-medium shadow-lg"
        >
          {busy ? 'Return to focus' : 'Start focusing'}
        </button>
        {busy && <TimerGlance id={GLANCE_ID} className="text-ink-secondary text-sm" />}
      </div>
    </section>
    {footer}
  </>
);

/**
 * The timer page's top bar: the way home, and the page's title for assistive
 * technology. The title is focused when the page opens from home, so a screen
 * reader says where it is and the first Tab reaches the timer's controls.
 */
export const TimerTopBar = ({
  onHome,
  headingRef,
}: {
  onHome: () => void;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) => (
  <div className="flex w-full max-w-md items-center">
    <button
      type="button"
      onClick={onHome}
      className="rounded-pill text-ink-secondary hover:text-ink-primary hover:bg-night-800/60 pressable -ml-3 px-3 py-1.5 text-xs"
    >
      <span aria-hidden>← </span>Home
    </button>
    <h2 ref={headingRef} tabIndex={-1} data-focus-yields className="sr-only outline-none">
      Focus
    </h2>
  </div>
);
