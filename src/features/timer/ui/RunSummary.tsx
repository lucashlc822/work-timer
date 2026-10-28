import { useRef } from 'react';

import { StarMark, useFocusIfLost } from '@/shared/ui';

import { formatDuration } from '../domain/format';
import type { RunSummary as Summary } from '../domain/types';

interface Props {
  summary: Summary;
  onDone: () => void;
}

/** How a Pomodoro run went, shown when it is ended between blocks. */
export const RunSummary = ({ summary, onDone }: Props) => {
  // "End run" is gone with the break screen; land on Done.
  const doneRef = useRef<HTMLButtonElement>(null);
  useFocusIfLost(doneRef);

  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <StarMark size={56} className={summary.blocks > 0 ? '' : 'opacity-40'} />
      <div className="space-y-1">
        <h2 className="text-ink-primary text-xl">Run ended</h2>
        <p className="text-ink-secondary text-sm">
          {summary.blocks} {summary.blocks === 1 ? 'star' : 'stars'} this run ·{' '}
          {formatDuration(summary.focusS)} of focus
        </p>
      </div>
      <button
        ref={doneRef}
        type="button"
        onClick={onDone}
        className="rounded-pill bg-lavender-400 text-night-900 hover:bg-lavender-300 px-8 py-2.5 text-sm transition-colors"
      >
        Done
      </button>
    </div>
  );
};
