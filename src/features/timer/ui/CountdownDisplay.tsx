import { formatRemaining } from '../domain/format';

interface Props {
  remainingMs: number;
  /** Fraction elapsed, in [0, 1]. */
  progress: number;
  size?: 'large' | 'small';
  /** What the bar measures, for screen readers: "Session progress" or "Break progress". */
  label?: string;
}

/**
 * The remaining time and a thin progress bar. Purely presentational: callers
 * compute both numbers from the clock at render time.
 */
export const CountdownDisplay = ({
  remainingMs,
  progress,
  size = 'large',
  label = 'Session progress',
}: Props) => (
  <div className="flex w-full flex-col items-center gap-3">
    <p
      role="timer"
      aria-live="off"
      className={`text-ink-primary font-mono tabular-nums ${
        size === 'large' ? 'text-6xl font-light tracking-tight' : 'text-2xl'
      }`}
    >
      {formatRemaining(remainingMs)}
    </p>
    <ProgressBar progress={progress} label={label} />
  </div>
);

export const ProgressBar = ({
  progress,
  label = 'Session progress',
}: {
  progress: number;
  label?: string;
}) => (
  <div
    role="progressbar"
    aria-label={label}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={Math.round(progress * 100)}
    className="bg-night-700 h-1 w-full max-w-56 overflow-hidden rounded-pill"
  >
    <div
      className="bg-lavender-300 h-full rounded-pill"
      style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
    />
  </div>
);
