import { ringFraction } from '../domain/ring';
import { useBalance, useProgress } from '../hooks/useStardust';
import { count, stardust } from './format';

const RING = 36;
const STROKE = 4;
const RADIUS = (RING - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const TILE =
  'rounded-soft border-night-600/60 bg-night-800/60 flex min-h-16 flex-1 items-center justify-center gap-2 border px-3 py-2';

/**
 * Today at a glance, on the home page: the goal ring and the streak (premium
 * motion PR 5). Waits for its first read rather than flashing a zero. Static:
 * nothing here animates, so a refresh of the numbers never moves the page.
 */
export const TodayGlance = () => {
  const progress = useProgress();
  if (progress === undefined) return null;
  const { focusMin, goalMin, reached, streak } = progress;
  const fraction = ringFraction(focusMin, goalMin);
  return (
    <>
      <div
        role="group"
        aria-label={`Today ${focusMin} of ${goalMin} min${reached ? ', goal reached' : ''}`}
        className={TILE}
      >
        <svg
          width={RING}
          height={RING}
          viewBox={`0 0 ${RING} ${RING}`}
          aria-hidden
          className="shrink-0 -rotate-90"
        >
          <circle
            cx={RING / 2}
            cy={RING / 2}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
            className="stroke-night-600"
          />
          <circle
            cx={RING / 2}
            cy={RING / 2}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
            className={reached ? 'stroke-star-warm' : 'stroke-lavender-400'}
          />
        </svg>
        <div aria-hidden className="flex flex-col leading-tight">
          <span className="text-ink-primary text-base font-medium">
            {focusMin}
            <span className="text-ink-secondary text-2xs font-normal"> /{goalMin}</span>
          </span>
          <span className="text-ink-secondary text-2xs">Minutes today</span>
        </div>
      </div>
      <div role="group" aria-label={`${streak}-day streak`} className={TILE}>
        <div aria-hidden className="flex flex-col items-center leading-tight">
          <span className="text-ink-primary text-base font-medium">{streak}</span>
          <span className="text-ink-secondary text-2xs">Day streak</span>
        </div>
      </div>
    </>
  );
};

/** The balance, as a tile that opens the Stardust panel. */
export const StardustTile = ({ onOpen }: { onOpen: () => void }) => {
  const balance = useBalance() ?? 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={stardust(balance)}
      className={`${TILE} hover:border-lavender-400 pressable`}
    >
      <span aria-hidden className="flex flex-col items-center leading-tight">
        <span className="text-ink-primary text-base font-medium">
          <span className="text-star-warm mr-1">✦</span>
          {count(balance)}
        </span>
        {/* The space makes the text read "25 Stardust", as the footer's pill did. */}{' '}
        <span className="text-ink-secondary text-2xs">Stardust</span>
      </span>
    </button>
  );
};
