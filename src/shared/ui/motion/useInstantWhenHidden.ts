import { useEffect } from 'react';
import { MotionGlobalConfig } from 'motion/react';

/**
 * While the window is hidden (the tray, minimised), finish every animation at
 * once instead of running it.
 *
 * WebView2 stops delivering animation frames to a hidden window, so a
 * transition begun then would sit part-way and complete in a burst on return;
 * an exit never finishing would also leave its element mounted. Skipping makes
 * the state change land immediately and the window comes back in order.
 */
export const useInstantWhenHidden = (): void => {
  useEffect(() => {
    const sync = () => {
      MotionGlobalConfig.skipAnimations = document.visibilityState === 'hidden';
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      MotionGlobalConfig.skipAnimations = false;
    };
  }, []);
};
