import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';

export interface ElementRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const read = (el: Element): ElementRect => {
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
};

const same = (a: ElementRect | null, b: ElementRect | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    Math.abs(a.x - b.x) < 0.5 &&
    Math.abs(a.y - b.y) < 0.5 &&
    Math.abs(a.w - b.w) < 0.5 &&
    Math.abs(a.h - b.h) < 0.5);

/**
 * Where an element is in the window, kept current: when it or its parent
 * resizes, when the window does, and after each render of the caller (a banner
 * appearing above it moves it without resizing it). Null while it isn't laid
 * out (detached, or `hidden`). Only a real change sets state, so a caller that
 * renders often pays one rect read per render and nothing more.
 */
export const useElementRect = (ref: RefObject<Element | null>): ElementRect | null => {
  const [rect, setRect] = useState<ElementRect | null>(null);

  const measure = () => {
    const el = ref.current;
    const next = el === null ? null : read(el);
    const visible = next !== null && (next.w > 0 || next.h > 0) ? next : null;
    setRect((prev) => (same(prev, visible) ? prev : visible));
  };

  // After every render: cheap, and catches moves that resize nothing.
  useLayoutEffect(measure);

  useEffect(() => {
    const el = ref.current;
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => measure());
    if (el !== null && observer !== null) {
      observer.observe(el);
      if (el.parentElement !== null) observer.observe(el.parentElement);
    }
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
    // `measure` reads only the ref; re-subscribing per render would be waste.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref]);

  return rect;
};
