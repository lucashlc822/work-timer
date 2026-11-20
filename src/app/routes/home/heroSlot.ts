import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';

import { HERO_FILL, HERO_MIN_SIZE } from '@/features/sky';
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
  idle: 'max-h-40 tall:max-h-80',
  running: 'max-h-72 tall:max-h-96',
  break: 'max-h-48 tall:max-h-72',
  result: 'max-h-40 tall:max-h-56',
};

/**
 * Room the idle card may still need below it. Its top is anchored so its
 * controls never move under the pointer (TimerScreen), and it grows downward:
 * Custom's slider by 65 px, Pomodoro's settings (a 2x2 grid of sliders) by up to
 * 88 px, measured in a production-like build; the dev build's extra preset row
 * changes them. Before the grid, Pomodoro grew the card 202 px.
 *
 * Plus `LATE_LINES`: the card's progress line and constellation hint arrive from
 * the local database ~100 ms after the page opens, 36 px in all, and the slot is
 * frozen from the first reading. Without that allowance the card ended 36 px
 * taller than the slot thought, the next growth overflowed, and choosing a mode
 * made the card jump up (88 px at 1280x900). A time window that measured again
 * while content arrived failed on a loaded machine, whose data arrives later.
 * The reserve is the larger growth plus both of these, plus 8 px.
 */
const LATE_LINES = 36;
const GROWTH_RESERVE: Record<HeroKind, number> = {
  idle: 88 + LATE_LINES + 8,
  running: 0,
  break: 0,
  result: 0,
};

/** The slot's share of the free room on the timer page. */
export const SLOT_SHARE = 2 / 3;

/**
 * The slot's frozen height (UI review M2).
 *
 * `flex` is what the slot measured as a flex item (already within `cap`), and
 * `spare` the empty room under the timer's content, which takes the rest of the
 * free space; together they are all the free room. The slot gets `SLOT_SHARE`
 * of it, within `cap` (NaN for none), and never so much that less than
 * `reserve` is left for the card to grow into. The reserve comes out of the
 * whole free room, not out of the slot: before, it was taken off the slot's
 * flex height even when the room under the card could hold it, which left a
 * tall window's idle figure at ~120 px over 180 px of empty sky.
 */
export const slotHeight = ({
  flex,
  spare,
  cap,
  reserve,
}: {
  flex: number;
  spare: number;
  cap: number;
  reserve: number;
}): number => {
  const free = flex + Math.max(0, spare);
  const share = Number.isFinite(cap) ? Math.min(cap, free * SLOT_SHARE) : free * SLOT_SHARE;
  const height = Math.floor(Math.min(share, free - reserve));
  // Too short to draw the figure in: take no room at all rather than push the
  // card down for nothing.
  return height >= MIN_USEFUL_SLOT ? height : 0;
};

/** The shortest slot the sky will draw a hero in (`heroInSlot`). */
export const MIN_USEFUL_SLOT = Math.ceil(HERO_MIN_SIZE / HERO_FILL);

/**
 * Empty room at the bottom of `section`, below its content (0 if there is none).
 * The idle timer's wrapper fills the section (it anchors the card to the top),
 * so there the content ends with the card; other states end with their children.
 */
const spareBelow = (section: Element | null): number => {
  if (section === null) return 0;
  const bottom = section.getBoundingClientRect().bottom;
  const card = section.querySelector('[data-timer-card]');
  let content = section.getBoundingClientRect().top;
  for (const el of card === null ? Array.from(section.children) : [card]) {
    const r = el.getBoundingClientRect();
    if (r.height > 0) content = Math.max(content, r.bottom);
  }
  return Math.max(0, bottom - content);
};

/**
 * The slot's height, frozen while the page shows the same thing.
 *
 * The slot takes a share of the room the card leaves (flex), so left alone it
 * would shrink whenever the card grew and pull the card up with it. Instead it
 * is measured once, as flex, whenever `kind`, the window, or what sits above
 * the timer (`aboveKey`) changes, sized from all the free room by `slotHeight`,
 * and held at that height until the next such change. Both passes run before
 * paint.
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
    const slot = ref.current;
    const flexHeight = slot.getBoundingClientRect().height;
    setMeasured({
      trigger,
      height: slotHeight({
        flex: flexHeight,
        spare: spareBelow(slot.nextElementSibling),
        cap: parseFloat(getComputedStyle(slot).maxHeight),
        reserve: GROWTH_RESERVE[kind],
      }),
    });
    // `trigger` covers the slot appearing too: `aboveKey` carries the page.
  }, [enabled, frozen, ref, trigger, kind]);

  return frozen;
};
