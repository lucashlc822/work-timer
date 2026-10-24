import { createContext, useContext } from 'react';

import type { TimerSession } from '../hooks/useTimerSession';

/** The main window's one timer; provided by `TimerProvider`. */
export const TimerContext = createContext<TimerSession | null>(null);

export const useTimer = (): TimerSession => {
  const timer = useContext(TimerContext);
  if (timer === null) throw new Error('useTimer outside TimerProvider');
  return timer;
};
