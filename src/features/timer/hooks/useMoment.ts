import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { prefersReducedMotion, systemClock } from '@/shared/lib';

import { MOMENT_TIMELINE, type MomentKind, type MomentStage } from '../domain/moment';

export interface Moment {
  stage: MomentStage;
  /**
   * Show the end at once: the person skipped it (Escape, a click), or reduced
   * motion never played it. False when it simply ran its course.
   */
  skipped: boolean;
  /** Jumps to `settled`. Safe to call at any stage. */
  skip: () => void;
}

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
};
const isVisible = () => document.visibilityState === 'visible';

/**
 * Plays one completion moment (see `domain/moment.ts`) for the component that
 * mounts it: one per finished result, since a result lives only in memory and
 * a reload never brings it back.
 *
 * It waits while the result isn't on screen: `present` false (another view is
 * open over the timer) or the window hidden (WebView2 reports the tray and
 * minimised as hidden, see `src-tauri/src/lib.rs`). Going away part-way skips
 * to the end rather than pausing, so coming back never shows half a moment.
 *
 * Escape skips while it plays. It listens on `document` in the bubble phase and
 * ignores an Escape something else already handled.
 *
 * `onStart` is called once, when it starts (also under reduced motion, which
 * goes straight to `settled`): the chime and the sky's arrival hang off it.
 *
 * The stage timers belong to an effect keyed on when the moment started, and
 * are re-armed from the time already elapsed, so StrictMode's mount-unmount-
 * mount in development cancels nothing for good.
 */
export const useMoment = (
  kind: MomentKind,
  { present, onStart }: { present: boolean; onStart?: (at: number) => void },
): Moment => {
  const visible = useSyncExternalStore(subscribeVisibility, isVisible, () => true);
  const canStart = present && visible;
  // Already on screen when it mounts (the usual case): the first frame is the
  // first stage, so nothing flashes in its final state before it starts.
  const [stage, setStage] = useState<MomentStage>(() =>
    canStart ? (prefersReducedMotion() ? 'settled' : 'ignite') : 'waiting',
  );
  const [skipped, setSkipped] = useState(() => canStart && prefersReducedMotion());
  /** Wall-clock ms the timeline runs from; null when there is no timeline to run. */
  const [startedAt, setStartedAt] = useState<number | null>(null);
  /** Once true it never starts (again): started, or skipped before it could. */
  const started = useRef(false);
  const onStartRef = useRef(onStart);
  useEffect(() => {
    onStartRef.current = onStart;
  }, [onStart]);

  const skip = useCallback(() => {
    started.current = true;
    setStartedAt(null);
    setStage('settled');
    setSkipped(true);
  }, []);

  useEffect(() => {
    if (started.current || !canStart) return;
    started.current = true;
    const now = systemClock.now();
    onStartRef.current?.(now);
    if (prefersReducedMotion()) {
      setStage('settled');
      setSkipped(true);
      return;
    }
    setStage('ignite');
    setStartedAt(now);
  }, [canStart]);

  useEffect(() => {
    if (startedAt === null) return;
    const elapsed = systemClock.now() - startedAt;
    const ids = MOMENT_TIMELINE[kind]
      .filter((step) => step.atMs > elapsed)
      .map((step) => window.setTimeout(() => setStage(step.stage), step.atMs - elapsed));
    return () => {
      for (const id of ids) window.clearTimeout(id);
    };
  }, [startedAt, kind]);

  const playing = stage !== 'waiting' && stage !== 'settled';

  // Leaving part-way finishes it: coming back shows the end, never the middle.
  useEffect(() => {
    if (playing && !canStart) skip();
  }, [playing, canStart, skip]);

  useEffect(() => {
    if (!playing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      skip();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [playing, skip]);

  return { stage, skipped, skip };
};
