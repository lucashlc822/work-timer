import { systemClock } from '@/shared/lib';

import { timerGlance } from '../domain/glance';
import { useTick } from '../hooks/useTick';
import { useTimer } from './timerContext';

/** A glance is minute-resolution: repaint four times a minute, never every second. */
const GLANCE_TICK_MS = 15_000;

/**
 * What the timer is doing, in one line, for a page that isn't showing it
 * ("Focusing · 18 min left"). Renders nothing when nothing is in progress.
 */
export const TimerGlance = ({ id, className }: { id?: string; className?: string }) => {
  const timer = useTimer();
  const text = timerGlance(timer.status, timer.session, timer.run, systemClock.now());
  useTick(text !== null, GLANCE_TICK_MS);
  if (text === null) return null;
  return (
    <span id={id} className={className}>
      {text}
    </span>
  );
};
