import { useEffect, useState } from 'react';

/**
 * Re-render about four times a second while `active` and the document is
 * visible; stop entirely while hidden.
 *
 * This is a *repaint* loop and nothing else. It never feeds a number into the
 * timer — every displayed value is recomputed from the clock at render time —
 * so a throttled or skipped tick can only make the display momentarily stale,
 * never wrong.
 */
export const useTick = (active: boolean, intervalMs = 250): void => {
  const [, setFrame] = useState(0);

  useEffect(() => {
    if (!active) return;

    let timer: ReturnType<typeof setInterval> | undefined;
    const repaint = () => setFrame((n) => n + 1);

    const sync = () => {
      if (document.visibilityState === 'visible') {
        repaint();
        timer ??= setInterval(repaint, intervalMs);
      } else if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
    };

    sync();
    document.addEventListener('visibilitychange', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      if (timer !== undefined) clearInterval(timer);
    };
  }, [active, intervalMs]);
};
