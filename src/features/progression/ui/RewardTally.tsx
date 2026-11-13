import { useEffect, useState } from 'react';

import { prefersReducedMotion } from '@/shared/lib';

import { lineLabel, rewardSummary, type FinishedConstellation } from '../domain/rewards';
import { useSessionRewards } from '../hooks/useSessionRewards';
import { count, signed } from './format';
import { ProgressLine } from './ProgressLine';

/** Between one line coming in and the next. */
export const TALLY_STAGGER_MS = 350;
/** How long the total takes to count up once the lines are in. */
const COUNT_MS = 900;

interface TallyProps {
  userId: string;
  /** The session(s) whose rewards to show: one result, or a Pomodoro run's blocks. */
  sessionIds: readonly string[];
  /** A constellation they finished, from the sky through `app/`. */
  finished?: readonly FinishedConstellation[];
  /** The result's moment has reached its tally: the lines come in. */
  reveal?: boolean;
  /** Skipped, or reduced motion: show the end at once, no stagger, no count. */
  instant?: boolean;
}

/**
 * Counts up to `target` from zero once `run` turns on. The end at once, read
 * straight from `target` at render (not copied in by an effect), when `instant`
 * or reduced motion: the tally appears the moment its rewards load, and must
 * never show a frame of "+0".
 */
const useCountUp = (target: number, run: boolean, instant: boolean, delayMs: number): number => {
  const still = instant || prefersReducedMotion();
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (still || !run) return;
    let frame = 0;
    const from = performance.now() + delayMs;
    const step = (t: number) => {
      const p = Math.min(1, Math.max(0, (t - from) / COUNT_MS));
      setShown(Math.round(target * (1 - (1 - p) ** 3)));
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, run, still, delayMs]);
  return still ? target : shown;
};

/**
 * What a finished session earned, under its result (session-complete redesign,
 * PR 2): one line per kind of Stardust it earned ("Focus · 25 min +25",
 * "Daily goal reached +20", "3-day streak +30", "The Kite complete +25"), each
 * coming in after the last, then the total counting up. A session that earned
 * only its own Stardust shows just the total, "✦ +25 Stardust", as before.
 * Today's progress line sits underneath.
 *
 * Decorative to assistive tech (`aria-hidden`): the same facts are one
 * sentence in the result's status (`RewardSummary`), so a screen reader hears
 * them once, not number by number as the total counts.
 *
 * Read-only: the numbers are what the reconciler pays, asked of its own rules.
 */
export const RewardTally = ({
  userId,
  sessionIds,
  finished,
  reveal = true,
  instant = false,
}: TallyProps) => {
  const rewards = useSessionRewards(userId, sessionIds, finished);
  const lines = rewards?.lines ?? [];
  const total = rewards?.total ?? 0;
  const itemised = lines.length > 1;
  const totalDelay = instant ? 0 : itemised ? lines.length * TALLY_STAGGER_MS : 0;
  const shown = useCountUp(total, reveal, instant, totalDelay);
  if (rewards === undefined || total <= 0) return null;

  const progressDelay =
    reveal && !instant ? { transitionDelay: `${totalDelay + COUNT_MS}ms` } : undefined;
  const part = (index: number) => ({
    className: `moment-part ${reveal ? '' : 'moment-pending'}`,
    style: reveal && !instant ? { transitionDelay: `${index * TALLY_STAGGER_MS}ms` } : undefined,
  });

  return (
    <div className="flex flex-col items-center gap-2">
      <div aria-hidden="true" className="flex w-60 max-w-full flex-col gap-1.5 text-sm">
        {itemised && (
          <ul className="space-y-1">
            {lines.map((line, i) => (
              <li key={line.kind} {...part(i)}>
                <span className="flex justify-between gap-6">
                  <span className="text-ink-secondary">{lineLabel(line)}</span>
                  <span className="text-ink-primary tabular-nums">{signed(line.delta)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p
          {...part(itemised ? lines.length : 0)}
          data-testid="reward-total"
          className={`${part(0).className} ${
            itemised ? 'border-night-600 border-t pt-1.5' : ''
          } flex items-center justify-center`}
        >
          <span className="text-star-warm mr-1.5">✦</span>
          <span className="text-ink-primary tabular-nums">+{count(shown)} Stardust</span>
        </p>
      </div>
      {/* Last, once the total has counted up. */}
      <div {...part(itemised ? lines.length + 1 : 1)} style={progressDelay}>
        <ProgressLine />
      </div>
    </div>
  );
};

/** The tally as one sentence, for the result's status region. Visually hidden. */
export const RewardSummary = ({
  userId,
  sessionIds,
  finished,
}: Pick<TallyProps, 'userId' | 'sessionIds' | 'finished'>) => {
  const rewards = useSessionRewards(userId, sessionIds, finished);
  if (rewards === undefined || rewards.total <= 0) return null;
  return <span className="sr-only"> {rewardSummary(rewards)}</span>;
};
