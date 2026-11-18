import { useLayoutEffect, useRef, type RefObject } from 'react';

import { MOTION } from '../../../../design-tokens.mjs';
import type { Placement } from '../domain/layout';

const bezier = (p: readonly number[]) => `cubic-bezier(${p.join(', ')})`;

const reducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * How long after `key` changes a change of box still counts as that change.
 * The page's slot is measured after it lays out, so the new box arrives a
 * frame or two after the new key.
 */
const SETTLE_MS = 1000;

const same = (a: Placement, b: Placement) =>
  Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.size - b.size) < 0.5;

/**
 * Glides a figure from where it was to where it now is, when the page it sits
 * behind changes state (premium motion PR 4): the element is already drawn at
 * its new box, and one Web Animation runs it from the old box's transform to
 * none (FLIP). One-shot: nothing runs per frame once it lands. A resize of the
 * window, which changes the box without changing `key`, just snaps.
 *
 * Appearing (no old box) fades in; reduced motion fades instead of moving.
 */
export const useFigureFlip = (
  ref: RefObject<SVGGElement | null>,
  box: Placement | null,
  key: string | undefined,
): void => {
  const last = useRef<{ box: Placement | null; key: string | undefined }>({ box, key });
  // The box the figure was in when `key` last changed, until it has moved on.
  const pending = useRef<{ from: Placement | null; at: number } | null>(null);

  useLayoutEffect(() => {
    const was = last.current;
    last.current = { box, key };
    const now = performance.now();
    if (key !== undefined && was.key !== undefined && was.key !== key) {
      pending.current = { from: pending.current?.from ?? was.box, at: now };
    }
    const glide = pending.current;
    const el = ref.current;
    if (glide === null || box === null || el === null) return;
    if (now - glide.at > SETTLE_MS) {
      pending.current = null;
      return;
    }
    if (glide.from !== null && same(glide.from, box)) return; // not moved yet
    pending.current = null;
    if (typeof el.animate !== 'function') return;

    if (glide.from === null || reducedMotion()) {
      el.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: reducedMotion() ? MOTION.duration.quick : MOTION.duration.enter,
        easing: bezier(MOTION.ease.standard),
      });
      return;
    }
    const k = glide.from.size / box.size;
    const dx = glide.from.x - box.x * k;
    const dy = glide.from.y - box.y * k;
    el.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${k})` }, { transform: 'none' }], {
      duration: MOTION.duration.pageIn,
      easing: bezier(MOTION.ease.enter),
    });
  }, [ref, box, key]);
};
