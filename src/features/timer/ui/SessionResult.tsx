import { StarMark } from '@/shared/ui';

import { formatDuration, formatTimeOfDay } from '../domain/format';
import type { FinishedResult } from '../domain/timerMachine';

interface Props {
  result: FinishedResult;
  error: string | null;
  onDone: () => void;
}

/**
 * How the session ended.
 *
 * Always states the real end time. When the app was quit through the
 * deadline, this is the first thing the user sees on relaunch — and "Finished
 * at 3:40 pm" is the honest answer, not the time they reopened the app.
 */
export const SessionResult = ({ result, error, onDone }: Props) => {
  const { ending } = result;
  const completed = ending.outcome === 'completed';

  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <div className="relative flex h-24 w-24 items-center justify-center">
        {completed && (
          <div
            aria-hidden="true"
            className="bg-mint-300/20 absolute inset-2 rounded-full blur-2xl"
          />
        )}
        <StarMark
          size={completed ? 80 : 48}
          className={completed ? 'relative' : 'relative opacity-40'}
        />
      </div>

      <div className="space-y-1">
        <h2 className="text-ink-primary text-xl">
          {completed ? 'Session complete' : 'Session ended early'}
        </h2>
        <p className="text-ink-secondary text-sm">{formatDuration(ending.actualFocusS)} of focus</p>
        <p className="text-ink-muted text-xs">
          {completed ? 'Finished' : 'Ended'} at {formatTimeOfDay(ending.endedAt)}
        </p>
      </div>

      {error !== null && <p className="text-faded text-xs">{error}</p>}

      <button
        type="button"
        onClick={onDone}
        className="rounded-pill bg-lavender-400 text-night-900 hover:bg-lavender-300 px-8 py-2.5 text-sm transition-colors"
      >
        Done
      </button>
    </div>
  );
};
