import { useProgress } from '../hooks/useStardust';

/**
 * "Today 35 of 60 min · 4-day streak", under the Start button. The streak is
 * left out until there is one; the line waits for its first read rather than
 * flashing a zero.
 */
export const ProgressLine = () => {
  const progress = useProgress();
  if (progress === undefined) return null;
  const { focusMin, goalMin, reached, streak } = progress;
  return (
    <p className="text-ink-muted text-xs">
      <span className={reached ? 'text-star-warm' : undefined}>
        {reached && <span aria-hidden>✦ </span>}
        Today {focusMin} of {goalMin} min
      </span>
      {streak > 0 && <span> · {streak}-day streak</span>}
    </p>
  );
};
