export { systemClock, createTestClock } from './clock';
export type { Clock, TestClock } from './clock';

export { newId, newSeed } from './id';

export {
  describeDevice,
  defaultAbandonmentPolicy,
  isStandalone,
  isTouchPrimary,
  prefersReducedMotion,
} from './platform';
export type { AbandonmentPolicy } from './platform';
