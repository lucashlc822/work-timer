import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';

import type { TimerStatus } from '@/features/timer';

/** What the timer page shows, as far as the hero constellation's slot is concerned. */
export type HeroKind = 'idle' | 'running' | 'break' | 'result';

export const heroKindOf = (status: TimerStatus): HeroKind => {
  switch (status) {
    case 'running':
      return 'running';
    case 'onBreak':
    case 'breakOver':
      return 'break';
    case 'finishing':
    case 'finished':
    case 'runSummary':
      return 'result';
    default:
      return 'idle';
  }
};

/**
 * How tall the slot may grow. The running countdown is small, so the
 * constellation gets the most room then; the idle, break and result cards are tall.
 */
export const HERO_SLOT_CAP: Record<HeroKind, string> = {
  idle: 'max-h-40 tall:max-h-64',
  running: 'max-h-72 tall:max-h-96',
  break: 'max-h-48 tall:max-h-72',
  result: 'max-h-40 tall:max-h-56',
};

/**
 * Room the idle card may still need below it. Its top is anchored so its
 * controls never move under the pointer (TimerScreen), and it grows downward:
 * Custom's slider by ~54 px, Pomodoro's settings by ~68 px. The slot leaves
 * that much free so switching mode neither moves the card nor scrolls the page.
 */
const GROWTH_RESERVE: Record<HeroKind, number> = { idle: 72, running: 0, break: 0, result: 0 };

/**
 * The slot's height, frozen while the page shows the same thing.
 *
 * The slot takes a share of the room the card leaves (flex), so left alone it
 * would shrink whenever the card grew and pull the card up with it. Instead it
 * is measured once, at its flex size, whenever `kind`, the window, or what sits
 * above the timer (`aboveKey`) changes, less the card's growth reserve, and
 * held at that height until the next such change. Both passes run before paint.
 *
 * Returns null during the measuring pass (render the slot as flex then).
 */
export const useFrozenSlotHeight = (
  ref: RefObject<HTMLElement | null>,
  kind: HeroKind,
  aboveKey: string,
  /** Off (home): the slot just flexes; nothing is measured or held. */
  enabled = true,
): number | null => {
  const [windowKey, setWindowKey] = useState(() =>
    typeof window === 'undefined' ? '' : `${window.innerWidth}x${window.innerHeight}`,
  );
  useEffect(() => {
    const onResize = () => setWindowKey(`${window.innerWidth}x${window.innerHeight}`);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Content that grows after the height was measured (a result's reward lines
  // arrive from the database) must not make the page scroll: if it overflows,
  // measure again, which can only make the slot smaller.
  const [overflows, setOverflows] = useState(0);
  useEffect(() => {
    const main = ref.current?.parentElement;
    if (main == null || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (document.documentElement.scrollHeight > window.innerHeight + 1) {
        setOverflows((n) => n + 1);
      }
    });
    observer.observe(main);
    return () => observer.disconnect();
  }, [ref, kind, aboveKey]);

  // A height is good only for the circumstances it was measured in; anything
  // that changes the room available makes it null again (measure, as flex).
  const trigger = `${kind}|${windowKey}|${aboveKey}|${overflows}`;
  const [measured, setMeasured] = useState<{ trigger: string; height: number } | null>(null);
  const frozen = measured?.trigger === trigger ? measured.height : null;

  useLayoutEffect(() => {
    if (!enabled || frozen !== null || ref.current === null) return;
    const flexHeight = ref.current.getBoundingClientRect().height;
    setMeasured({ trigger, height: Math.max(0, Math.floor(flexHeight - GROWTH_RESERVE[kind])) });
    // `trigger` covers the slot appearing too: `aboveKey` carries the page.
  }, [enabled, frozen, ref, trigger, kind]);

  return frozen;
};
