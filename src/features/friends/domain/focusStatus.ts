/**
 * "Focusing now" (M7 phase 3): what this person is doing right now, as their
 * friends see it — in a focus block, on a Pomodoro break, or neither.
 *
 * Derived from the timer's stored state (the running session and the
 * Pomodoro run in `meta`), never stored on its own on this device. The server
 * keeps one copy for friends, overwritten as it changes.
 */

export interface FocusStatus {
  kind: 'focus' | 'break';
  /** Epoch ms. */
  startedAt: number;
  /** Epoch ms: the planned end. After it, the status reads as nothing. */
  until: number;
}

/** The parts of the timer's stored state the status depends on. */
export interface TimerState {
  /** The session running now, if any. */
  session: { startedAt: number; plannedDurationS: number; endedAt: number | null } | null;
  /** The Pomodoro run's break, if one is under way. */
  runBreak: { startedAt: number; durationS: number } | null;
}

export const currentStatus = (
  { session, runBreak }: TimerState,
  now: number,
): FocusStatus | null => {
  if (session !== null && session.endedAt === null) {
    const until = session.startedAt + session.plannedDurationS * 1000;
    // Past its planned end it is finishing, not running (an app reopened late).
    return until > now ? { kind: 'focus', startedAt: session.startedAt, until } : null;
  }
  if (runBreak !== null) {
    const until = runBreak.startedAt + runBreak.durationS * 1000;
    // A break that's over is a person waiting to start the next block: idle.
    if (until > now) return { kind: 'break', startedAt: runBreak.startedAt, until };
  }
  return null;
};

/** Whether two statuses would tell friends the same thing. */
export const sameStatus = (a: FocusStatus | null, b: FocusStatus | null): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.kind === b.kind &&
    a.startedAt === b.startedAt &&
    a.until === b.until);

/** "Focusing now · 18 min left", "On a break · 3 min left"; null once it's over. */
export const statusLine = (status: FocusStatus | null, now: number): string | null => {
  if (status === null || status.until <= now) return null;
  const minutes = Math.max(1, Math.ceil((status.until - now) / 60_000));
  return `${status.kind === 'focus' ? 'Focusing now' : 'On a break'} · ${minutes} min left`;
};
