import { useLayoutEffect, useRef, type RefObject } from 'react';

import { MOTION, STAGGER_CAP_MS } from '../../../../design-tokens.mjs';
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

/**
 * One FLIP: `el` is already drawn at `to`; run it from `from`'s transform to
 * none. The element is moved in the svg's own coordinates.
 */
export const flipBetween = (
  el: SVGGElement,
  from: Placement,
  to: Placement,
  duration: number,
  easing: readonly number[],
): Animation | null => {
  if (typeof el.animate !== 'function') return null;
  el.style.transformBox = 'view-box';
  el.style.transformOrigin = '0 0';
  const k = from.size / to.size;
  const dx = from.x - to.x * k;
  const dy = from.y - to.y * k;
  return el.animate(
    [{ transform: `translate(${dx}px, ${dy}px) scale(${k})` }, { transform: 'none' }],
    { duration, easing: bezier(easing) },
  );
};

/**
 * The sky opening and closing (premium motion PR 6). Behind a page the sky
 * shows one figure (the hero); the full sky shows them all in a grid.
 *
 * Opening: the hero glides from where it was to its cell, and the other
 * figures fade in one after another (`stagger`, capped). Closing: the hero
 * glides back from its cell. Reduced motion fades instead of moving. Remembers
 * where the hero was and where every figure sat, so each direction knows its
 * start; one-shot Web Animations, nothing per frame afterwards.
 */
export const useSkyEntrance = (
  svg: RefObject<SVGSVGElement | null>,
  hero: RefObject<SVGGElement | null>,
  full: boolean,
  shown: readonly { id: string; box: Placement }[],
): void => {
  const lastHero = useRef<{ id: string; box: Placement } | null>(null);
  const lastGrid = useRef<ReadonlyMap<string, Placement>>(new Map());
  const wasFull = useRef(full);

  useLayoutEffect(() => {
    const opened = full && !wasFull.current;
    const closed = !full && wasFull.current;
    wasFull.current = full;
    const reduced = reducedMotion();

    if (opened && svg.current !== null) {
      const from = lastHero.current;
      const figures = svg.current.querySelectorAll<SVGGElement>('g[data-figure]');
      let i = 0;
      for (const el of figures) {
        const id = el.getAttribute('data-figure');
        const to = shown.find((s) => s.id === id)?.box;
        if (!reduced && from !== null && id === from.id && to !== undefined) {
          flipBetween(el, from.box, to, MOTION.duration.pageIn, MOTION.ease.enter);
        } else if (typeof el.animate === 'function') {
          el.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration: reduced ? MOTION.duration.quick : MOTION.duration.enter,
            delay: reduced ? 0 : Math.min(++i * MOTION.duration.stagger, STAGGER_CAP_MS),
            easing: bezier(MOTION.ease.standard),
            fill: 'backwards',
          });
        }
      }
    }

    if (closed && hero.current !== null) {
      const now = shown[0];
      const from = now === undefined ? undefined : lastGrid.current.get(now.id);
      if (now !== undefined && from !== undefined && !reduced) {
        flipBetween(hero.current, from, now.box, MOTION.duration.pageOut, MOTION.ease.standard);
      } else if (typeof hero.current.animate === 'function') {
        hero.current.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: MOTION.duration.quick,
          easing: bezier(MOTION.ease.standard),
        });
      }
    }

    if (full) lastGrid.current = new Map(shown.map((s) => [s.id, s.box]));
    else lastHero.current = shown[0] ?? null;
  });
};
