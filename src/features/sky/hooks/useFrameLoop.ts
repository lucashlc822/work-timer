import { useEffect, useRef } from 'react';

import { onReducedMotionChange, prefersReducedMotion } from '@/shared/lib';

let frames = 0;

/**
 * Frames drawn since the page loaded. Exposed through the dev console helper
 * so acceptance can confirm the loop really stops when the window is hidden.
 */
export const frameCount = (): number => frames;

/**
 * An animation loop that is cheap to leave running for hours.
 *
 * - Capped at `fps` (24 by default): twinkle and a drift measured in minutes
 *   per screen-width gain nothing from 60 frames a second, and the app is
 *   meant to sit open through a 90-minute session.
 * - Stops entirely while the document is hidden. On desktop that includes the
 *   tray and minimised states, now that WebView2 is told (see CLAUDE.md).
 * - Under `prefers-reduced-motion`, draws one still frame and never loops.
 *
 * `draw` receives the elapsed milliseconds since the loop's first frame; it is
 * read through a ref so a new closure every render does not restart the loop.
 */
export const useFrameLoop = (draw: (elapsedMs: number) => void, enabled = true, fps = 24): void => {
  const drawRef = useRef(draw);
  useEffect(() => {
    drawRef.current = draw;
  }, [draw]);

  useEffect(() => {
    if (!enabled) return;

    const start = performance.now();
    const interval = 1000 / fps;
    let last = -Infinity;
    let handle: number | null = null;

    const tick = (now: number) => {
      handle = requestAnimationFrame(tick);
      if (now - last < interval) return;
      last = now;
      frames += 1;
      drawRef.current(now - start);
    };

    const sync = () => {
      const visible = document.visibilityState === 'visible';
      if (prefersReducedMotion()) {
        if (handle !== null) cancelAnimationFrame(handle);
        handle = null;
        drawRef.current(0);
        return;
      }
      if (visible && handle === null) handle = requestAnimationFrame(tick);
      if (!visible && handle !== null) {
        cancelAnimationFrame(handle);
        handle = null;
      }
    };

    sync();
    document.addEventListener('visibilitychange', sync);
    const stopMotionWatch = onReducedMotionChange(sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      stopMotionWatch();
      if (handle !== null) cancelAnimationFrame(handle);
    };
  }, [enabled, fps]);
};
