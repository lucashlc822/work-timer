import { useEffect, useRef, type ReactNode } from 'react';

import type { FinishedResult } from '../domain/timerMachine';
import { useTimerSession } from '../hooks/useTimerSession';
import { TimerContext } from './timerContext';

/**
 * The one timer for the main window, shared by the screen and the app.
 *
 * The screen drives it from clicks; the app (M7) drives it from a friend's
 * room — starting a focus-together session at the shared moment, or ending it
 * when a friend cancels — and needs to hear when a session ends. Both must
 * talk to the same machine, so it lives here rather than inside the screen.
 *
 * `onEnded` is called once per finished session (completed or ended early,
 * including a Pomodoro block going into its break), with how it ended.
 */
export const TimerProvider = ({
  children,
  onEnded,
}: {
  children: ReactNode;
  onEnded?: (result: FinishedResult) => void;
}) => {
  const timer = useTimerSession();

  const onEndedRef = useRef(onEnded);
  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  // Each result object is one ending; a resumed or dismissed screen doesn't
  // repeat it.
  const reported = useRef<FinishedResult | null>(null);
  useEffect(() => {
    const { result } = timer;
    if (result === null || result === reported.current) return;
    reported.current = result;
    onEndedRef.current?.(result);
  }, [timer]);

  return <TimerContext.Provider value={timer}>{children}</TimerContext.Provider>;
};
