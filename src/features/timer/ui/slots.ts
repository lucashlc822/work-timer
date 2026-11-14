import type { ReactNode } from 'react';

import type { MomentStage } from '../domain/moment';

/**
 * Places in the timer's UI that the app can fill from other features.
 *
 * The timer must not import the sky (features are opaque to each other), but
 * the result screen is exactly where a new star belongs. So `app/` composes
 * them: it passes sky components in through these render props, and the timer
 * only knows it is rendering "something" in a named place.
 */
export interface ResultInfo {
  sessionId: string;
  seed: string;
  outcome: 'completed' | 'cancelled';
  actualFocusS: number;
  /** The focus-together room it ran in (M7); null for a solo session. */
  togetherId: string | null;
  /** Who ended a focus-together session early, when it wasn't you; null otherwise. */
  endedBy: string | null;
}

/**
 * How far a result's completion moment has got (`domain/moment.ts`), for slot
 * content that comes in with it. `skipped` covers reduced motion too: either
 * way, show the end at once.
 */
export interface MomentInfo {
  stage: MomentStage;
  skipped: boolean;
}

/** A Pomodoro run that has just ended, for the app's lines about it. */
export interface RunInfo {
  blocks: number;
  focusS: number;
  /** The completed blocks' sessions, oldest first. */
  sessionIds: readonly string[];
}

/** The session on screen while it runs, for the app's lines about it. */
export interface RunningInfo {
  sessionId: string;
  togetherId: string | null;
}

export interface TagPickerProps {
  value: string | null;
  onChange: (tagId: string | null) => void;
  disabled: boolean;
}

export interface TimerSlots {
  /** Where a session's tag is chosen: idle, running, and between blocks. */
  tagPicker?: (props: TagPickerProps) => ReactNode;
  /**
   * Idle only: what the next session is for (M7 phase 5: your own sky or a
   * shared constellation). The app owns the choice and passes it to the
   * screen as `sharedId`.
   */
  targetPicker?: (props: { disabled: boolean }) => ReactNode;
  /** Under the Start button. Receives the chosen length, in seconds. */
  startHint?: (plannedS: number) => ReactNode;
  /** Under the start hint on the idle screen: today's progress and streak. */
  progressLine?: () => ReactNode;
  /** Replaces the default star on a *completed* result. */
  resultStar?: (result: ResultInfo, moment?: MomentInfo) => ReactNode;
  /** Under the result text, for both outcomes. */
  resultNote?: (result: ResultInfo, moment: MomentInfo) => ReactNode;
  /**
   * Beside "Start another" on a completed result: further ways on from it (PR 3:
   * "See it in your sky"). Quiet buttons; the slot brings its own.
   */
  resultActions?: (result: ResultInfo) => ReactNode;
  /**
   * Under a Pomodoro block's "Block N done" between blocks: where the star went
   * and what the block earned. Lighter than `resultNote`: no tally, which waits
   * for the run summary (session-complete redesign PR 6).
   */
  blockNote?: (result: ResultInfo, moment: MomentInfo) => ReactNode;
  /**
   * Under a Pomodoro run's summary: everything the run earned (PR 6). The
   * moment tells it when to come in.
   */
  runNote?: (run: RunInfo, moment: MomentInfo) => ReactNode;
  /**
   * Inside the run summary's status region, after its text: one sentence a
   * screen reader hears with it (what the run earned). Visually hidden.
   */
  runSummary?: (run: RunInfo) => ReactNode;
  /**
   * Inside the result's status region, after its text: one sentence a screen
   * reader hears with "Session complete" (PR 2: what it earned). Visually hidden.
   */
  resultSummary?: (result: ResultInfo) => ReactNode;
  /** Under the "ends at" line while a session runs (M7: who you focus with). */
  running?: (session: RunningInfo) => ReactNode;
  /** Added to the end-early dialog (M7: that it ends the session for friends too). */
  cancelNote?: (session: RunningInfo) => ReactNode;
  /**
   * Idle only: something that takes the place of the start controls (M7: the
   * focus-together lobby you're in). While it returns non-null, no session
   * can be started from this screen.
   */
  idleOverride?: () => ReactNode;
  /**
   * Asked when Start is pressed; the session starts only if it resolves true
   * (M7: "start on your own?" while an invitation waits for an answer).
   */
  beforeStart?: () => Promise<boolean>;
}
