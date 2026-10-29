import { GOAL_BONUS, MAX_DAILY_GOAL_MIN, MIN_DAILY_GOAL_MIN } from '../domain/economy';
import { updateDailyGoal, useProgress } from '../hooks/useStardust';

const STEP_MIN = 5;

const stepButton =
  'rounded-pill border-night-600 text-ink-secondary hover:border-lavender-400 hover:text-ink-primary border px-3 py-1 text-sm transition-colors disabled:opacity-40 disabled:hover:border-night-600';

/** Today's progress and the streak, with the daily goal setting. */
export const GoalAndStreak = () => {
  const progress = useProgress();
  if (progress === undefined) return null;
  const { focusMin, goalMin, reached, streak } = progress;
  const fraction = Math.min(1, focusMin / goalMin);

  return (
    <section
      aria-label="Daily goal and streak"
      className="border-night-600 bg-night-800/70 rounded-soft flex w-full flex-col gap-4 border p-4"
    >
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-ink-primary">Today</span>
        <span className={reached ? 'text-star-warm' : 'text-ink-secondary'}>
          {focusMin} of {goalMin} min{reached ? ' ✦' : ''}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Progress toward the daily goal"
        aria-valuemin={0}
        aria-valuemax={goalMin}
        aria-valuenow={Math.min(focusMin, goalMin)}
        className="bg-night-700 rounded-pill h-1.5 w-full overflow-hidden"
      >
        <div
          className="bg-lavender-400 rounded-pill h-full transition-[width] duration-500"
          style={{ width: `${fraction * 100}%` }}
        />
      </div>

      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-ink-primary">Daily goal</span>
        <span className="flex items-center gap-2">
          <button
            type="button"
            aria-label={`Lower the goal by ${STEP_MIN} minutes`}
            disabled={goalMin <= MIN_DAILY_GOAL_MIN}
            onClick={() => void updateDailyGoal(goalMin - STEP_MIN)}
            className={stepButton}
          >
            −
          </button>
          <span className="text-ink-primary min-w-18 text-center">{goalMin} min</span>
          <button
            type="button"
            aria-label={`Raise the goal by ${STEP_MIN} minutes`}
            disabled={goalMin >= MAX_DAILY_GOAL_MIN}
            onClick={() => void updateDailyGoal(goalMin + STEP_MIN)}
            className={stepButton}
          >
            +
          </button>
        </span>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-ink-primary">Streak</span>
        <span className="text-ink-secondary">
          {streak > 0 ? `${streak} ${streak === 1 ? 'day' : 'days'}` : 'None yet'}
        </span>
      </div>

      <p className="text-ink-muted text-xs">
        Reaching the goal pays {GOAL_BONUS} Stardust. A day counts toward the streak when you
        complete a session; skip a day and it starts over.
      </p>
    </section>
  );
};
