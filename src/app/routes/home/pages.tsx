import type { ReactNode, RefObject } from 'react';

import { ProgressLine } from '@/features/progression';
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
 * Home: the one big thing to do, and the ways to everything else.
 *
 * The call to action starts focusing; while a session, a break or a lobby is in
 * progress it returns to it instead, and says what the timer is doing
 * ("Focusing · 18 min left") at minute resolution, so home never repaints every
 * second.
 */
export const HomePage = ({
  busy,
  ctaRef,
  onFocus,
  footer,
}: {
  /** A session, a break, a result or a lobby is in progress on the timer page. */
  busy: boolean;
  ctaRef: RefObject<HTMLButtonElement | null>;
  onFocus: () => void;
  footer: ReactNode;
}) => (
  <>
    <section className="flex w-full flex-1 flex-col items-center justify-center gap-3">
      <button
        ref={ctaRef}
        type="button"
        onClick={onFocus}
        aria-describedby={busy ? GLANCE_ID : undefined}
        className="rounded-pill bg-lavender-400 text-night-900 hover:bg-lavender-300 shadow-lavender-400/25 hover:shadow-lavender-400/40 pressable px-12 py-3.5 text-base font-medium shadow-lg"
      >
        {busy ? 'Return to focus' : 'Start focusing'}
      </button>
      {busy ? (
        <TimerGlance id={GLANCE_ID} className="text-ink-secondary text-sm" />
      ) : (
        <ProgressLine />
      )}
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
    <h2 ref={headingRef} tabIndex={-1} className="sr-only outline-none">
      Focus
    </h2>
  </div>
);
