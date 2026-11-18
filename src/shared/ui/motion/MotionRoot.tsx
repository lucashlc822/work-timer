import type { ReactNode } from 'react';
import { LazyMotion, MotionConfig } from 'motion/react';

import { useInstantWhenHidden } from './useInstantWhenHidden';

// A function, not an import: the animation features become their own chunk,
// fetched after first paint, so the library doesn't sit in front of the timer.
const loadFeatures = () => import('./features').then((module) => module.default);

/**
 * Everything animated with Motion lives under this. `strict` makes a stray
 * `motion.*` component (which would pull the whole library into the main
 * bundle) throw in development; use `m.*` instead. `reducedMotion="user"`
 * honours the operating system setting: Motion drops transforms and keeps
 * opacity, which is the cross-fade the design calls for.
 */
export const MotionRoot = ({ children }: { children: ReactNode }) => {
  useInstantWhenHidden();
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
};
