/**
 * Timer domain types.
 *
 * Built on top of `SessionRow` rather than replacing it: the row is what gets
 * persisted, these are what the timer reasons about. An `ActiveSession` is the
 * subset of a row that is meaningful while a session is still in flight —
 * there is no `endedAt` or `outcome` yet, so they are absent rather than null.
 */

import type { PomodoroRunRow, PomodoroSettingsRow, RunBreakRow, SessionMode } from '@/shared/db';

export interface ActiveSession {
  id: string;
  mode: SessionMode;
  /** The Pomodoro run this block belongs to; null for a countdown. */
  runId: string | null;
  /** 1-based block number within the run; null for a countdown. */
  runIndex: number | null;
  /** Epoch ms. Elapsed time is always `now - startedAt`, never a tick count. */
  startedAt: number;
  plannedDurationS: number;
  seed: string;
  tagId: string | null;
  device: string;
  /** Informational only. Never affects whether the session succeeds. */
  awayMs: number;
  /** The focus-together room it runs in (M7); null for a solo session. */
  togetherId: string | null;
}

export type PomodoroSettings = PomodoroSettingsRow;
export type RunBreak = RunBreakRow;
export type PomodoroRun = PomodoroRunRow;

/**
 * What the user chose before pressing start. A Pomodoro draft starts a new
 * run; its first block's length comes from `settings.focusS`.
 */
export type SessionDraft =
  | {
      mode: 'countdown';
      plannedDurationS: number;
      tagId: string | null;
      /**
       * A focus-together session (M7): it starts at the room's shared start
       * (server time) rather than now, so every member counts down to the
       * same end.
       */
      together?: TogetherStart;
    }
  | { mode: 'pomodoro'; settings: PomodoroSettings; tagId: string | null };

export interface TogetherStart {
  roomId: string;
  /** Epoch ms: the room's start, the same for every member. */
  startsAt: number;
}

/** How a session is being ended from outside the screen (M7: a friend's cancel). */
export interface CancelRequest {
  /** Epoch ms the cancel happened; the session's focus counts up to it. */
  at?: number;
  /** Who ended it, for the result ("Bea ended the session"); absent when it was you. */
  endedBy?: string;
}

/** A freshly started session, with the run it belongs to (null for a countdown). */
export interface StartedSession {
  session: ActiveSession;
  run: PomodoroRun | null;
}

/** How a run went, shown when it ends. */
export interface RunSummary {
  /** Completed blocks — one star each. */
  blocks: number;
  focusS: number;
}

/** The final fields written when a session stops being in flight. */
export interface SessionEnding {
  outcome: 'completed' | 'cancelled';
  /** Epoch ms. For a completion this is the *planned* end, not when it was noticed. */
  endedAt: number;
  actualFocusS: number;
}
