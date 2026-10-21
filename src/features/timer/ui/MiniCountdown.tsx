import { systemClock } from '@/shared/lib';

import { formatRemaining } from '../domain/format';
import { breakProgress, breakRemainingMs, isBreakOver } from '../domain/pomodoro';
import { isComplete, progress, remainingMs } from '../domain/session';
import { useActiveRun } from '../hooks/useActiveRun';
import { useActiveSession } from '../hooks/useActiveSession';
import { useTick } from '../hooks/useTick';
import { ProgressBar } from './CountdownDisplay';

/**
 * Read-only countdown for the mini window.
 *
 * Follows the main window through the database and computes the time itself;
 * it never writes and offers no cancel. Shows a Pomodoro break's countdown,
 * labelled "Break", between blocks. Shows `--:--` when nothing is counting
 * down, including in the moment between a deadline passing and the main
 * window recording it, and once a break is over (the next block waits for a
 * click in the main window).
 */
export const MiniCountdown = () => {
  const session = useActiveSession();
  const run = useActiveRun();
  const now = systemClock.now();
  const running = session != null && !isComplete(session, now);
  const brk = !running && run?.break != null && !isBreakOver(run.break, now) ? run.break : null;
  useTick(running || brk !== null);

  const remaining = running
    ? remainingMs(session, now)
    : brk !== null
      ? breakRemainingMs(brk, now)
      : null;
  const fraction = running ? progress(session, now) : brk !== null ? breakProgress(brk, now) : 0;

  return (
    <>
      {brk !== null && <p className="text-mint-300 text-[10px] tracking-widest uppercase">Break</p>}
      <p role="timer" className="text-ink-primary font-mono text-2xl tabular-nums">
        {remaining !== null ? formatRemaining(remaining) : '--:--'}
      </p>
      <div className="w-4/5">
        <ProgressBar
          progress={fraction}
          label={brk !== null ? 'Break progress' : 'Session progress'}
        />
      </div>
    </>
  );
};
