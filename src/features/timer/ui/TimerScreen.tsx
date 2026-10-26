import { useCallback, useState } from 'react';

import { systemClock } from '@/shared/lib';

import { DEFAULT_MINUTES, minutesToSeconds } from '../domain/durations';
import { formatDuration, formatTimeOfDay } from '../domain/format';
import { cancelledEnding, plannedEndAt, progress, remainingMs } from '../domain/session';
import { useTick } from '../hooks/useTick';
import { pomodoroLimits, useTimerPrefs } from '../hooks/useTimerPrefs';
import { useTimer } from './timerContext';
import { BreakScreen } from './BreakScreen';
import { CancelDialog } from './CancelDialog';
import { CountdownDisplay } from './CountdownDisplay';
import { DurationPicker } from './DurationPicker';
import { ModeToggle } from './ModeToggle';
import { PomodoroSettingsPanel } from './PomodoroSettingsPanel';
import { RunSummary } from './RunSummary';
import { SecondaryButton } from './SecondaryButton';
import { SessionResult } from './SessionResult';
import type { TimerSlots } from './slots';

/**
 * The main window: pick a length (or a Pomodoro set-up), commit, and watch it
 * run.
 *
 * Every number on screen is computed from `systemClock.now()` during render.
 * `useTick` only decides how often that happens.
 *
 * `slots` lets the app add content from other features (the sky) without the
 * timer importing them — features stay opaque to each other.
 *
 * `sharedId` is the shared constellation the next session is for (M7 phase 5),
 * chosen through `slots.targetPicker`; null for your own sky. It goes into the
 * draft as it is when Start is pressed, and the session keeps it.
 */
export const TimerScreen = ({
  slots = {},
  sharedId = null,
}: {
  slots?: TimerSlots;
  sharedId?: string | null;
}) => {
  const timer = useTimer();
  const prefs = useTimerPrefs();
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES);
  const [confirming, setConfirming] = useState(false);

  const inFlight = timer.status === 'running' || timer.status === 'finishing';
  useTick(inFlight);
  const now = systemClock.now();

  const keepGoing = useCallback(() => setConfirming(false), []);

  // A tag chosen mid-session is also the one the idle screen remembers next.
  const { setTag } = timer;
  const { setTagId } = prefs;
  const changeTag = useCallback(
    (tagId: string | null) => {
      setTag(tagId);
      setTagId(tagId);
    },
    [setTag, setTagId],
  );

  if (timer.status === 'loading' || !prefs.loaded) {
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

  if (timer.status === 'runSummary' && timer.summary !== null) {
    return <RunSummary summary={timer.summary} onDone={timer.dismiss} />;
  }

  if ((timer.status === 'onBreak' || timer.status === 'breakOver') && timer.run !== null) {
    return (
      <BreakScreen
        run={timer.run}
        result={timer.result}
        error={timer.error}
        busy={timer.busy}
        slots={slots}
        onTagChange={changeTag}
        onSkip={timer.skipBreak}
        onStartNext={timer.startNext}
        onEndRun={timer.endRun}
      />
    );
  }

  if (inFlight && timer.session !== null) {
    const session = timer.session;
    const block = session.runIndex;
    const running = { sessionId: session.id, togetherId: session.togetherId };
    return (
      <div className="flex w-full flex-col items-center gap-6">
        {block !== null && (
          <p className="text-ink-muted text-xs tracking-widest uppercase">
            Block {block} · Pomodoro
          </p>
        )}
        <CountdownDisplay
          remainingMs={remainingMs(session, now)}
          progress={progress(session, now)}
        />
        <p className="text-ink-muted text-xs">
          {formatDuration(session.plannedDurationS)} · ends at{' '}
          {formatTimeOfDay(plannedEndAt(session))}
        </p>
        {slots.running?.(running)}

        {slots.tagPicker?.({
          value: session.tagId,
          onChange: changeTag,
          disabled: timer.status !== 'running',
        })}

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
            runStarsKept={block !== null ? (timer.run?.blocksDone ?? 0) : null}
            note={slots.cancelNote?.(running)}
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
  const pomodoro = prefs.mode === 'pomodoro';
  const plannedS = pomodoro ? prefs.settings.focusS : minutesToSeconds(minutes);
  return (
    <div className="flex w-full flex-col items-center gap-6">
      <ModeToggle mode={prefs.mode} onChange={prefs.setMode} disabled={starting} />
      {slots.tagPicker?.({ value: prefs.tagId, onChange: prefs.setTagId, disabled: starting })}
      {slots.targetPicker?.({ disabled: starting })}
      {pomodoro ? (
        <PomodoroSettingsPanel
          settings={prefs.settings}
          limits={pomodoroLimits}
          onChange={prefs.setSettings}
          disabled={starting}
        />
      ) : (
        <DurationPicker minutes={minutes} onChange={setMinutes} disabled={starting} />
      )}
      <button
        type="button"
        disabled={starting}
        onClick={() =>
          timer.start(
            pomodoro
              ? { mode: 'pomodoro', settings: prefs.settings, tagId: prefs.tagId, sharedId }
              : { mode: 'countdown', plannedDurationS: plannedS, tagId: prefs.tagId, sharedId },
          )
        }
        className="rounded-pill bg-lavender-400 text-night-900 hover:bg-lavender-300 px-10 py-3 text-base transition-colors disabled:opacity-60"
      >
        {pomodoro ? 'Start Pomodoro' : `Start ${minutes} min`}
      </button>
      {slots.startHint?.(plannedS)}
      {slots.progressLine?.()}
      {timer.error !== null && <p className="text-faded text-xs">{timer.error}</p>}
    </div>
  );
};
