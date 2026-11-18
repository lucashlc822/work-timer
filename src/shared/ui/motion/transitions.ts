import type { Transition } from 'motion/react';

import { MOTION, STAGGER_CAP_MS } from '../../../../design-tokens.mjs';

const seconds = (ms: number): number => ms / 1000;

/**
 * The app's motion vocabulary as Motion transitions. Built from `MOTION`, the
 * mirror of tokens.css, so a CSS transition and a Motion one with the same name
 * are the same movement.
 *
 * Rules (CLAUDE.md, "Decisions already made"): opacity is always a tween, never
 * a spring; a spring is for movement only; nothing here may bounce more than
 * `page` does.
 */
export const TRANSITIONS = {
  /** A press, a hover, a colour change. */
  press: { duration: seconds(MOTION.duration.press), ease: MOTION.ease.standard },
  quick: { duration: seconds(MOTION.duration.quick), ease: MOTION.ease.standard },
  /** Something appearing / leaving (popover, toast, card). Exits are shorter. */
  enter: { duration: seconds(MOTION.duration.enter), ease: MOTION.ease.enter },
  exit: { duration: seconds(MOTION.duration.exit), ease: MOTION.ease.exit },
  /** A panel sliding over the page. */
  panelIn: { duration: seconds(MOTION.duration.panelIn), ease: MOTION.ease.enter },
  panelOut: { duration: seconds(MOTION.duration.panelOut), ease: MOTION.ease.exit },
  /** Movement between UI states: settles without a bounce. */
  spring: { type: 'spring', visualDuration: 0.3, bounce: 0 },
  /** A page-level move (a surface becoming the next page): a hint of life. */
  pageSpring: { type: 'spring', visualDuration: 0.45, bounce: 0.1 },
  /** Going back is quicker than going in. */
  pageBackSpring: { type: 'spring', visualDuration: 0.3, bounce: 0 },
} as const satisfies Record<string, Transition>;

/** Delay for the `index`th item of a staggered group, capped as a whole. */
export const staggerDelay = (index: number): number =>
  Math.min(index * MOTION.duration.stagger, STAGGER_CAP_MS) / 1000;
