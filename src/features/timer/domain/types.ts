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
}

export type PomodoroSettings = PomodoroSettingsRow;
export type RunBreak = RunBreakRow;
export type PomodoroRun = PomodoroRunRow;

/**
 * What the user chose before pressing start. A Pomodoro draft starts a new
 * run; its first block's length comes from `settings.focusS`.
 */
export type SessionDraft =
  | { mode: 'countdown'; plannedDurationS: number; tagId: string | null }
  | { mode: 'pomodoro'; settings: PomodoroSettings; tagId: string | null };

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
