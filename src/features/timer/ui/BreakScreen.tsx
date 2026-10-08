import { systemClock } from '@/shared/lib';
import { StarMark } from '@/shared/ui';

import { formatDuration, formatTimeOfDay } from '../domain/format';
import { breakEndsAt, breakProgress, breakRemainingMs, isBreakOver } from '../domain/pomodoro';
import type { FinishedResult } from '../domain/timerMachine';
import type { PomodoroRun } from '../domain/types';
import { useTick } from '../hooks/useTick';
import { CountdownDisplay } from './CountdownDisplay';
import { SecondaryButton } from './SecondaryButton';
import type { ResultInfo, TimerSlots } from './slots';

interface Props {
  run: PomodoroRun;
  /** The block that just completed, when this window saw it complete. */
  result: FinishedResult | null;
  error: string | null;
  busy: boolean;
  slots: TimerSlots;
  onSkip: () => void;
  onStartNext: () => void;
  onEndRun: () => void;
}

/**
 * Between two Pomodoro blocks: the break counting down, then "break's over".
 *
 * Which of the two is shown is derived from the clock at render time, so a
 * break that ran out while the window was hidden reads correctly on the
 * first frame back. The next block only ever starts from the button here.
 */
export const BreakScreen = ({
  run,
  result,
  error,
  busy,
  slots,
  onSkip,
  onStartNext,
  onEndRun,
}: Props) => {
  const brk = run.break;
  const now = systemClock.now();
  const resting = brk !== null && !isBreakOver(brk, now);
  useTick(resting);

  const nextBlock = run.blocksDone + 1;
  const info: ResultInfo | null =
    result === null
      ? null
      : {
          sessionId: result.session.id,
          seed: result.session.seed,
          outcome: result.ending.outcome,
          actualFocusS: result.ending.actualFocusS,
        };
  const star = info !== null ? slots.resultStar?.(info) : undefined;

  return (
    <div className="flex w-full flex-col items-center gap-5 text-center">
      {info !== null && (
        <div className="flex flex-col items-center gap-2">
          <div className="relative flex h-16 w-16 items-center justify-center">
            {star ?? <StarMark size={48} className="relative" />}
          </div>
          <p className="text-ink-secondary text-xs">
            Block {result!.session.runIndex ?? run.blocksDone} done ·{' '}
            {formatDuration(info.actualFocusS)} of focus
          </p>
        </div>
      )}

      {resting ? (
        <>
          <h2 className="text-ink-primary text-xl">
            {brk.kind === 'long' ? 'Long break' : 'Short break'}
          </h2>
          <CountdownDisplay
            remainingMs={breakRemainingMs(brk, now)}
            progress={breakProgress(brk, now)}
          />
          <p className="text-ink-muted text-xs">
            Back at {formatTimeOfDay(breakEndsAt(brk))} · block {nextBlock} waits for you
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <SecondaryButton onClick={onSkip} disabled={busy}>
              Skip break
            </SecondaryButton>
            <SecondaryButton onClick={onEndRun} disabled={busy}>
              End run
            </SecondaryButton>
          </div>
        </>
      ) : (
        <>
          <div className="space-y-1">
            <h2 className="text-ink-primary text-xl">Break&rsquo;s over</h2>
            <p className="text-ink-secondary text-sm">
              {run.blocksDone} {run.blocksDone === 1 ? 'star' : 'stars'} this run so far
            </p>
          </div>
          <button
            type="button"
            onClick={onStartNext}
            disabled={busy}
            className="rounded-pill bg-lavender-400 text-night-900 hover:bg-lavender-300 px-10 py-3 text-base transition-colors disabled:opacity-60"
          >
            Start block {nextBlock}
          </button>
          {slots.startHint?.(run.settings.focusS)}
          <SecondaryButton onClick={onEndRun} disabled={busy}>
            End run
          </SecondaryButton>
        </>
      )}

      {error !== null && <p className="text-faded text-xs">{error}</p>}
    </div>
  );
};
