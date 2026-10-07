import { useCallback, useState } from 'react';

import { systemClock } from '@/shared/lib';

import { DEFAULT_MINUTES, minutesToSeconds } from '../domain/durations';
import { formatDuration, formatTimeOfDay } from '../domain/format';
import { cancelledEnding, plannedEndAt, progress, remainingMs } from '../domain/session';
import { useTick } from '../hooks/useTick';
import { useTimerSession } from '../hooks/useTimerSession';
import { CancelDialog } from './CancelDialog';
import { CountdownDisplay } from './CountdownDisplay';
import { DurationPicker } from './DurationPicker';
import { SessionResult } from './SessionResult';
import type { TimerSlots } from './slots';

/**
 * The main window: pick a length, commit, and watch it run.
 *
 * Every number on screen is computed from `systemClock.now()` during render.
 * `useTick` only decides how often that happens.
 *
 * `slots` lets the app add content from other features (the sky) without the
 * timer importing them — features stay opaque to each other.
 */
export const TimerScreen = ({ slots = {} }: { slots?: TimerSlots }) => {
  const timer = useTimerSession();
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES);
  const [confirming, setConfirming] = useState(false);

  const inFlight = timer.status === 'running' || timer.status === 'finishing';
  useTick(inFlight);
  const now = systemClock.now();

  const keepGoing = useCallback(() => setConfirming(false), []);

  if (timer.status === 'loading') {
    return <p className="text-ink-muted text-sm">Opening…</p>;
  }

  if (timer.status === 'finished' && timer.result !== null) {
    return (
      <SessionResult
        result={timer.result}
        error={timer.error}
        onDone={timer.dismiss}
        slots={slots}
      />
    );
  }

  if (inFlight && timer.session !== null) {
    const session = timer.session;
    return (
      <div className="flex w-full flex-col items-center gap-6">
        <CountdownDisplay
          remainingMs={remainingMs(session, now)}
          progress={progress(session, now)}
        />
        <p className="text-ink-muted text-xs">
          {formatDuration(session.plannedDurationS)} · ends at{' '}
          {formatTimeOfDay(plannedEndAt(session))}
        </p>

        <div className="flex flex-wrap items-center justify-center gap-2">
          {timer.runtime?.miniWindow.isSupported === true && (
            <SecondaryButton onClick={() => void timer.runtime?.miniWindow.open()}>
              Pop out
            </SecondaryButton>
          )}
          <SecondaryButton
            onClick={() => setConfirming(true)}
            disabled={timer.status !== 'running'}
          >
            End early
          </SecondaryButton>
        </div>

        {confirming && timer.status === 'running' && (
          <CancelDialog
            focusedSoFar={formatDuration(cancelledEnding(session, now).actualFocusS)}
            onKeepGoing={keepGoing}
            onConfirm={() => {
              setConfirming(false);
              timer.confirmCancel();
            }}
          />
        )}
      </div>
    );
  }

  const starting = timer.status === 'starting';
  return (
    <div className="flex w-full flex-col items-center gap-6">
      <DurationPicker minutes={minutes} onChange={setMinutes} disabled={starting} />
      <button
        type="button"
        disabled={starting}
        onClick={() => timer.start({ plannedDurationS: minutesToSeconds(minutes), tagId: null })}
        className="rounded-pill bg-lavender-400 text-night-900 hover:bg-lavender-300 px-10 py-3 text-base transition-colors disabled:opacity-60"
      >
        Start {minutes} min
      </button>
      {slots.startHint?.(minutesToSeconds(minutes))}
      {timer.error !== null && <p className="text-faded text-xs">{timer.error}</p>}
    </div>
  );
};

const SecondaryButton = ({
  onClick,
  disabled = false,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="rounded-pill border-night-600 text-ink-secondary hover:border-lavender-400 hover:text-ink-primary border px-4 py-1.5 text-xs transition-colors disabled:opacity-50"
  >
    {children}
  </button>
);
