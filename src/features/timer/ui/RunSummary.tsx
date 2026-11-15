import { useRef, type MouseEvent } from 'react';

import { StarMark, useFocusIfLost } from '@/shared/ui';

import { formatDuration } from '../domain/format';
import { reached, type MomentStage } from '../domain/moment';
import type { RunSummary as Summary } from '../domain/types';
import { useMoment } from '../hooks/useMoment';
import type { MomentInfo, TimerSlots } from './slots';

interface Props {
  summary: Summary;
  onDone: () => void;
  slots?: TimerSlots;
  /** False while another view covers the timer: the moment waits for it to show. */
  present?: boolean;
}

/**
 * How a Pomodoro run went, shown when it is ended between blocks.
 *
 * Plays the same moment as a result (session-complete redesign PR 6): the star
 * ignites, the words come in, then what the whole run earned (`slots.runNote`),
 * then Done. A run with no completed block has nothing to celebrate and shows
 * as it always did. Every part is in the DOM from the first frame and Done has
 * focus at once; Escape or a click skips, and a click that skips presses nothing.
 */
export const RunSummary = ({ summary, onDone, slots = {}, present = true }: Props) => {
  // "End run" is gone with the break screen; land on Done.
  const doneRef = useRef<HTMLButtonElement>(null);
  useFocusIfLost(doneRef);

  const earned = summary.blocks > 0;
  const moment = useMoment('full', { present: present && earned });
  const stage: MomentStage = earned ? moment.stage : 'settled';
  const momentInfo: MomentInfo = { stage, skipped: !earned || moment.skipped };
  const playing = stage !== 'waiting' && stage !== 'settled';
  const part = (from: MomentStage) => `moment-part ${reached(stage, from) ? '' : 'moment-pending'}`;

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
      data-stage={earned ? stage : undefined}
      onClickCapture={skipOnClick}
    >
      <div className={stage === 'waiting' ? 'opacity-0' : undefined}>
        <StarMark
          size={56}
          className={`${earned ? '' : 'opacity-40'} ${playing ? 'moment-ignite' : ''}`}
        />
      </div>
      <div role="status" className={`space-y-1 delay-300 ${part('ignite')}`}>
        <h2 className="text-ink-primary text-xl">Run ended</h2>
        <p className="text-ink-secondary text-sm">
          {summary.blocks} {summary.blocks === 1 ? 'star' : 'stars'} this run ·{' '}
          {formatDuration(summary.focusS)} of focus
          {slots.runSummary?.(summary)}
        </p>
      </div>
      {earned && slots.runNote !== undefined && (
        <div className="flex flex-col items-center gap-1">
          {slots.runNote(
            { blocks: summary.blocks, focusS: summary.focusS, sessionIds: summary.sessionIds },
            momentInfo,
          )}
        </div>
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
