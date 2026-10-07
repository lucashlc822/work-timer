import { systemClock } from '@/shared/lib';

import { formatRemaining } from '../domain/format';
import { isComplete, progress, remainingMs } from '../domain/session';
import { useActiveSession } from '../hooks/useActiveSession';
import { useTick } from '../hooks/useTick';
import { ProgressBar } from './CountdownDisplay';

/**
 * Read-only countdown for the mini window.
 *
 * Follows the main window through the database and computes the time itself;
 * it never writes and offers no cancel. Shows `--:--` when nothing is running,
 * including in the moment between the deadline passing and the main window
 * recording the completion.
 */
export const MiniCountdown = () => {
  const session = useActiveSession();
  const now = systemClock.now();
  const running = session != null && !isComplete(session, now);
  useTick(running);

  return (
    <>
      <p role="timer" className="text-ink-primary font-mono text-2xl tabular-nums">
        {running ? formatRemaining(remainingMs(session, now)) : '--:--'}
      </p>
      <div className="w-4/5">
        <ProgressBar progress={running ? progress(session, now) : 0} />
      </div>
    </>
  );
};
