import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react';

import { MOTION } from '../../../../design-tokens.mjs';

/** A rectangle in window pixels. */
interface Box {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

/** The timer card, once the timer page shows its idle state (a plain attribute: the timer slice stays Motion-free). */
export const TIMER_CARD = '[data-timer-card]';

/** The card's radius (`rounded-soft`, 0.75rem). */
const CARD_RADIUS = 12;

const bezier = (p: readonly number[]) => `cubic-bezier(${p.join(', ')})`;

const reducedMotion = (): boolean =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, right: r.right, bottom: r.bottom };
};

/** `inner` as a clip-path inset of `outer`, with corner `radius`. */
const insetWithin = (outer: Box, inner: Box, radius: number) =>
  `inset(${inner.top - outer.top}px ${outer.right - inner.right}px ${outer.bottom - inner.bottom}px ${
    inner.left - outer.left
  }px round ${radius}px)`;

/**
 * The surface itself: clipped from the shape it leaves to the shape it reaches,
 * over the union of the two (so no inset is ever negative).
 */
const run = (
  el: HTMLDivElement,
  target: Element,
  start: Box,
  growing: boolean,
  duration: number,
): void => {
  const to = boxOf(target);
  const card = growing ? to : start;
  const button = growing ? start : to;
  const union: Box = {
    top: Math.min(card.top, button.top),
    left: Math.min(card.left, button.left),
    right: Math.max(card.right, button.right),
    bottom: Math.max(card.bottom, button.bottom),
  };
  const pill = (button.bottom - button.top) / 2;
  const cardClip = insetWithin(union, card, CARD_RADIUS);
  const buttonClip = insetWithin(union, button, pill);

  Object.assign(el.style, {
    display: 'block',
    top: `${union.top}px`,
    left: `${union.left}px`,
    width: `${union.right - union.left}px`,
    height: `${union.bottom - union.top}px`,
  });
  const shape = el.animate(
    [{ clipPath: growing ? buttonClip : cardClip }, { clipPath: growing ? cardClip : buttonClip }],
    { duration, easing: bezier(growing ? MOTION.ease.enter : MOTION.ease.standard) },
  );
  // The lavender face: the button's colour, giving way to the card's as it grows.
  (el.firstElementChild as HTMLElement | null)?.animate(
    growing
      ? [{ opacity: 1 }, { opacity: 0, offset: 0.4 }, { opacity: 0 }]
      : [{ opacity: 0 }, { opacity: 0, offset: 0.6 }, { opacity: 1 }],
    { duration },
  );
  // Growing, the surface goes under the card's own contents as they arrive.
  if (growing)
    el.animate([{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], { duration });
  const done = () => {
    el.style.display = 'none';
  };
  shape.onfinish = done;
  shape.oncancel = done;
};

export interface FocusMorph {
  /** Call just before switching to the timer page. */
  toTimer: () => void;
  /** Call just before switching to home. */
  toHome: () => void;
}

/**
 * Home's call to action grows into the timer card, and the card shrinks back
 * into it (premium motion PR 7; a container transform, M3's term).
 *
 * A temporary surface covering both shapes is clipped from one to the other
 * (`clip-path: inset(… round r)`, so the pill's radius stays round instead of
 * being stretched by a scale), its lavender face fading to the card's as it
 * grows. The real card's contents fade in from 40 % of the way, and the
 * surface fades out under them; going home, the button reappears as the
 * surface lands. One-shot Web Animations, measured once per navigation:
 * nothing is read or run while a session ticks. Reduced motion, or a page
 * with no card or no button to meet (a session in progress), just fades the
 * arriving element in.
 */
export const useFocusMorph = (
  page: 'home' | 'timer' | null,
  cta: RefObject<HTMLElement | null>,
  surface: RefObject<HTMLDivElement | null>,
): FocusMorph => {
  const pending = useRef<{ to: 'home' | 'timer'; from: Box | null } | null>(null);

  useLayoutEffect(() => {
    const p = pending.current;
    if (p === null || p.to !== page) return;
    pending.current = null;
    const el = surface.current;
    const target = page === 'timer' ? document.querySelector(TIMER_CARD) : cta.current;
    if (target === null || typeof target.animate !== 'function') return;

    const fadeIn = (duration: number, delay = 0) =>
      target.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration,
        delay,
        easing: bezier(MOTION.ease.standard),
        fill: 'backwards',
      });

    if (p.from === null || el === null || reducedMotion()) {
      fadeIn(MOTION.duration.quick);
      return;
    }

    const growing = page === 'timer';
    const duration = growing ? MOTION.duration.pageIn : MOTION.duration.pageOut;
    // Hide what is arriving now, before paint; where it lands is read a frame
    // later, once the page has finished laying out (the hero's slot settles its
    // height in a second pass, which moves the card).
    const arrival = growing
      ? fadeIn(duration * 0.6, duration * 0.4)
      : fadeIn(MOTION.duration.press, duration * 0.85);
    arrival.pause();
    // Not cancelled by the next render: the slot's second pass re-renders before
    // this frame, and a cancelled frame would leave the arrival hidden.
    const from = p.from;
    requestAnimationFrame(() => {
      arrival.play();
      run(el, target, from, growing, duration);
    });
  });

  return useMemo(
    () => ({
      toTimer: () => {
        pending.current = { to: 'timer', from: cta.current === null ? null : boxOf(cta.current) };
      },
      toHome: () => {
        const card = document.querySelector(TIMER_CARD);
        pending.current = { to: 'home', from: card === null ? null : boxOf(card) };
      },
    }),
    [cta],
  );
};
