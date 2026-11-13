import { useRef, type MouseEvent } from 'react';

import { StarMark, useFocusIfLost } from '@/shared/ui';

import { formatDuration, formatTimeOfDay } from '../domain/format';
import { reached, type MomentStage } from '../domain/moment';
import type { FinishedResult } from '../domain/timerMachine';
import { useMoment } from '../hooks/useMoment';
import type { ResultInfo, TimerSlots } from './slots';

interface Props {
  result: FinishedResult;
  error: string | null;
  onDone: () => void;
  slots: TimerSlots;
  /** False while another view covers the timer: the moment waits for it to show. */
  present?: boolean;
}

/**
 * How the session ended.
 *
 * Always states the real end time. When the app was quit through the
 * deadline, this is the first thing the user sees on relaunch — and "Finished
 * at 3:40 pm" is the honest answer, not the time they reopened the app.
 *
 * A completed session plays its moment first (`useMoment`, timeline in
 * `domain/moment.ts`): the star ignites, then the words, the notes and the
 * buttons come in. Every part is in the DOM from the first frame, so the
 * status is announced at once and Done has focus at once; only how they look
 * waits. Escape or a click skips to the end. A click that skips does nothing
 * else, so it can never land on a button that is still fading in; Enter and
 * Space on the focused Done always work. An early ending has no moment.
 */
export const SessionResult = ({ result, error, onDone, slots, present = true }: Props) => {
  const { ending } = result;
  const completed = ending.outcome === 'completed';
  const moment = useMoment('full', { present: present && completed });
  const stage: MomentStage = completed ? moment.stage : 'settled';
  const playing = stage !== 'waiting' && stage !== 'settled';
  const part = (from: MomentStage) => `moment-part ${reached(stage, from) ? '' : 'moment-pending'}`;

  const info: ResultInfo = {
    sessionId: result.session.id,
    seed: result.session.seed,
    outcome: ending.outcome,
    actualFocusS: ending.actualFocusS,
    togetherId: result.session.togetherId,
    endedBy: result.endedBy,
  };
  const customStar = completed ? slots.resultStar?.(info) : undefined;
  // The button that ended the session (or the countdown) is gone; land on Done.
  const doneRef = useRef<HTMLButtonElement>(null);
  useFocusIfLost(doneRef);

  const skipOnClick = (e: MouseEvent) => {
    // `detail` is 0 for a click made by Enter or Space: that one goes through.
    if (!playing || e.detail === 0) return;
    e.preventDefault();
    e.stopPropagation();
    moment.skip();
  };

  return (
    <div
      className="flex flex-col items-center gap-5 text-center"
      data-stage={completed ? stage : undefined}
      onClickCapture={skipOnClick}
    >
      <div
        className={`relative flex h-24 w-24 items-center justify-center ${
          stage === 'waiting' ? 'opacity-0' : ''
        }`}
      >
        {completed && (
          <div
            aria-hidden="true"
            className={`bg-mint-300/20 rounded-pill absolute inset-2 blur-2xl ${
              playing ? 'moment-halo' : ''
            }`}
          />
        )}
        {customStar !== undefined ? (
          <div className={`relative h-20 w-20 ${playing ? 'moment-ignite' : ''}`}>{customStar}</div>
        ) : (
          <StarMark
            size={completed ? 80 : 48}
            className={`relative ${completed ? (playing ? 'moment-ignite' : '') : 'opacity-40'}`}
          />
        )}
      </div>

      <div role="status" className={`space-y-1 delay-300 ${part('ignite')}`}>
        <h2 className="text-ink-primary text-xl">
          {completed ? 'Session complete' : 'Session ended early'}
        </h2>
        <p className="text-ink-secondary text-sm">{formatDuration(ending.actualFocusS)} of focus</p>
        <p className="text-ink-secondary text-xs">
          {completed ? 'Finished' : 'Ended'} at {formatTimeOfDay(ending.endedAt)}
        </p>
      </div>

      <div className={`flex flex-col items-center gap-5 ${part('arrive')}`}>
        {result.runBlocksKept !== null && (
          <p className="text-ink-secondary text-sm">
            Run ended — {result.runBlocksKept} {result.runBlocksKept === 1 ? 'star' : 'stars'} kept
          </p>
        )}
        {slots.resultNote?.(info)}
      </div>

      {error !== null && (
        <p role="alert" className="text-faded text-xs">
          {error}
        </p>
      )}

      <button
        ref={doneRef}
        type="button"
        onClick={onDone}
        className={`rounded-pill bg-lavender-400 text-night-900 hover:bg-lavender-300 px-8 py-2.5 text-sm transition-colors ${part('tally')}`}
      >
        Done
      </button>
    </div>
  );
};
