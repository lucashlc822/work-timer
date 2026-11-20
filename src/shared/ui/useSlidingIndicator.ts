import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

import { MOTION } from '../../../design-tokens.mjs';

const reducedMotion = (): boolean =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** `el`'s box in `track`'s own coordinates, transform included (so mid-glide it is where it looks to be). */
const within = (track: HTMLElement, el: Element): Rect => {
  const t = track.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return {
    x: r.left - t.left - track.clientLeft,
    y: r.top - t.top - track.clientTop,
    w: r.width,
    h: r.height,
  };
};

/**
 * A highlight that slides to the selected option (premium motion PR 9): one
 * element behind the options, moved to the selected one's box. The options hold
 * the text; this holds the fill or the outline.
 *
 * `track` must be `position: relative`; `indicator` is `position: absolute`, and
 * the selected option is the one with `aria-checked="true"` or
 * `aria-selected="true"`. Moving it is one FLIP Web Animation (transform only,
 * 240 ms, enter easing) from wherever the highlight visibly is, so a second
 * choice made mid-glide carries on from there. A window or container resize just
 * re-places it; reduced motion and the first placement don't move it at all;
 * with nothing selected it hides.
 *
 * Nothing here belongs to a countdown: it runs only when the selection changes.
 */
export const useSlidingIndicator = (
  track: RefObject<HTMLElement | null>,
  indicator: RefObject<HTMLElement | null>,
  selectedKey: string | number | null,
): void => {
  const placed = useRef(false);

  const place = (animate: boolean) => {
    const t = track.current;
    const ind = indicator.current;
    if (t === null || ind === null) return;
    const active = t.querySelector<HTMLElement>('[aria-checked="true"], [aria-selected="true"]');
    if (active === null || t.getBoundingClientRect().width === 0) {
      ind.style.opacity = '0';
      placed.current = false;
      return;
    }
    const from = placed.current ? within(t, ind) : null;
    ind.getAnimations().forEach((a) => a.cancel());
    const to = within(t, active);
    Object.assign(ind.style, {
      left: `${to.x}px`,
      top: `${to.y}px`,
      width: `${to.w}px`,
      height: `${to.h}px`,
      opacity: '1',
      transformOrigin: '0 0',
    });
    placed.current = true;
    if (!animate || from === null || reducedMotion() || typeof ind.animate !== 'function') return;
    const d = { x: from.x - to.x, y: from.y - to.y, sx: from.w / to.w, sy: from.h / to.h };
    const still =
      Math.abs(d.x) < 0.5 &&
      Math.abs(d.y) < 0.5 &&
      Math.abs(d.sx - 1) < 0.01 &&
      Math.abs(d.sy - 1) < 0.01;
    if (still) return;
    ind.animate(
      [
        { transform: `translate(${d.x}px, ${d.y}px) scale(${d.sx}, ${d.sy})` },
        { transform: 'none' },
      ],
      {
        duration: MOTION.duration.enter,
        easing: `cubic-bezier(${MOTION.ease.enter.join(', ')})`,
      },
    );
  };

  // The selection changed (or this is the first look): glide to it.
  useLayoutEffect(() => {
    place(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  // The container changed size, or fonts settled: re-place without a glide.
  useEffect(() => {
    const t = track.current;
    if (t === null || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => place(false));
    observer.observe(t);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track]);
};
