import { useEffect, useRef, useState } from 'react';

import { MOTION } from '../../../design-tokens.mjs';

const reduced = (): boolean =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * A number that counts to its new value when `target` changes (premium motion
 * PR 9). The first value is shown at once, so a page opening never counts up
 * from zero; reduced motion and a hidden window show every value at once. The
 * eased count takes `pageIn` (450 ms) and always ends on `target` exactly.
 */
export const useTweenedNumber = (target: number): number => {
  const [shown, setShown] = useState(target);
  const current = useRef(target);

  useEffect(() => {
    const from = current.current;
    if (from === target) return;
    if (reduced() || document.visibilityState === 'hidden') {
      current.current = target;
      setShown(target);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / MOTION.duration.pageIn);
      const value = p >= 1 ? target : Math.round(from + (target - from) * (1 - (1 - p) ** 3));
      current.current = value;
      setShown(value);
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return shown;
};
