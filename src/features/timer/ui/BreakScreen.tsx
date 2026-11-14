import { useRef } from 'react';

import { systemClock } from '@/shared/lib';
import { StarMark, useFocusIfLost } from '@/shared/ui';

import { db } from '@/shared/db';

import { chimeIfWanted } from '../data/completionSound';
import { formatDuration, formatTimeOfDay } from '../domain/format';
import { reached, type MomentStage } from '../domain/moment';
import { breakEndsAt, breakProgress, breakRemainingMs, isBreakOver } from '../domain/pomodoro';
import type { FinishedResult } from '../domain/timerMachine';
import type { PomodoroRun } from '../domain/types';
import { useMoment } from '../hooks/useMoment';
import { useTick } from '../hooks/useTick';
import { CountdownDisplay } from './CountdownDisplay';
import { SecondaryButton } from './SecondaryButton';
import type { MomentInfo, ResultInfo, TimerSlots } from './slots';

interface Props {
  run: PomodoroRun;
  /** The block that just completed, when this window saw it complete. */
  result: FinishedResult | null;
  error: string | null;
  busy: boolean;
  slots: TimerSlots;
  onTagChange: (tagId: string | null) => void;
  onSkip: () => void;
  onStartNext: () => void;
  onEndRun: () => void;
  /** False while another view covers the timer: the block's moment waits for it to show. */
  present?: boolean;
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
  onTagChange,
  onSkip,
  onStartNext,
  onEndRun,
  present = true,
}: Props) => {
  const brk = run.break;
  const now = systemClock.now();
  const resting = brk !== null && !isBreakOver(brk, now);
  useTick(resting);
  // The countdown (or Skip break) is gone: land on the break, then on "Start block".
  const breakRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  useFocusIfLost(breakRef, resting);
  useFocusIfLost(startRef, !resting);

  const nextBlock = run.blocksDone + 1;
  const info: ResultInfo | null =
    result === null
      ? null
      : {
          sessionId: result.session.id,
          seed: result.session.seed,
          outcome: result.ending.outcome,
          actualFocusS: result.ending.actualFocusS,
          togetherId: result.session.togetherId,
          endedBy: result.endedBy,
        };
  // A block this window saw complete gets the lighter moment (session-complete
  // PR 6): its star ignites and takes its place in the sky, with the chime. A
  // break resumed after a reload has no result, so no moment and no chime.
  const moment = useMoment('light', {
    present: present && info !== null,
    onStart: (at) => {
      if (result !== null) void chimeIfWanted(db, result.ending.endedAt, at);
    },
  });
  const momentInfo: MomentInfo = { stage: moment.stage, skipped: moment.skipped };
  const playing = moment.stage !== 'waiting' && moment.stage !== 'settled';
  const part = (from: MomentStage) =>
    `moment-part ${reached(moment.stage, from) ? '' : 'moment-pending'}`;
  const star = info !== null ? slots.resultStar?.(info, momentInfo) : undefined;
  // The run's tag, so a change here is what the next block will carry.
  const tagPicker = slots.tagPicker?.({
    value: run.tagId ?? null,
    onChange: onTagChange,
    disabled: busy,
  });

  return (
    // A focus target only (never in the Tab order), so no ring.
    <div
      ref={breakRef}
      tabIndex={-1}
      className="flex w-full flex-col items-center gap-5 text-center focus:outline-none"
    >
      {info !== null && (
        <div className="text-halo flex flex-col items-center gap-2" data-stage={moment.stage}>
          <div
            className={`relative flex h-16 w-16 items-center justify-center ${
              moment.stage === 'waiting' ? 'opacity-0' : ''
            }`}
          >
            <div className={`h-full w-full ${playing ? 'moment-ignite' : ''}`}>
              {star ?? <StarMark size={48} className="relative" />}
            </div>
          </div>
          <p role="status" className={`text-ink-secondary text-xs delay-200 ${part('ignite')}`}>
            Block {result!.session.runIndex ?? run.blocksDone} done ·{' '}
            {formatDuration(info.actualFocusS)} of focus
          </p>
          <div className={`flex flex-col items-center gap-1 ${part('arrive')}`}>
            {slots.blockNote?.(info, momentInfo)}
          </div>
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
            label="Break progress"
          />
          <p className="text-ink-secondary text-xs">
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
          {tagPicker}
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
            ref={startRef}
            type="button"
            onClick={onStartNext}
            disabled={busy}
            className="rounded-pill bg-lavender-400 text-night-900 hover:bg-lavender-300 px-10 py-3 text-base transition-colors disabled:opacity-60"
          >
            Start block {nextBlock}
          </button>
          {tagPicker}
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
