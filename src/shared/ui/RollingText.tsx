import { useEffect, useRef } from 'react';

import { MOTION } from '../../../design-tokens.mjs';

/** Changes closer together than this (dragging a slider) show at once, never roll. */
const MIN_GAP_MS = 150;

const reduced = (): boolean =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Text whose changed characters roll in (premium motion PR 9): each new
 * character rises a little as it fades up, so "25:00" becoming "50:00" moves
 * only the 2 and the 5. The first text, reduced motion, and changes faster
 * than `MIN_GAP_MS` apart show at once. Only for a value that changes on a
 * choice: never for a running countdown, which must not animate every second.
 */
export const RollingText = ({ text, className }: { text: string; className?: string }) => {
  const spans = useRef<(HTMLSpanElement | null)[]>([]);
  const last = useRef({ text, at: 0 });

  useEffect(() => {
    const was = last.current;
    const now = performance.now();
    last.current = { text, at: now };
    if (was.text === text || now - was.at < MIN_GAP_MS || reduced()) return;
    [...text].forEach((ch, i) => {
      const el = spans.current[i];
      if (el === null || el === undefined || ch === was.text[i]) return;
      if (typeof el.animate !== 'function') return;
      el.animate(
        [
          { opacity: 0, transform: 'translateY(0.25em)' },
          { opacity: 1, transform: 'none' },
        ],
        {
          duration: MOTION.duration.enter,
          easing: `cubic-bezier(${MOTION.ease.enter.join(', ')})`,
        },
      );
    });
  }, [text]);

  return (
    <span className={className}>
      {[...text].map((ch, i) => (
        <span
          key={i}
          ref={(el) => {
            spans.current[i] = el;
          }}
          className="inline-block"
        >
          {ch}
        </span>
      ))}
    </span>
  );
};
