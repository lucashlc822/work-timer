import type { ReactNode } from 'react';

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
  /** Under the Start button. Receives the chosen length, in seconds. */
  startHint?: (plannedS: number) => ReactNode;
  /** Under the start hint on the idle screen: today's progress and streak. */
  progressLine?: () => ReactNode;
  /** Replaces the default star on a *completed* result. */
  resultStar?: (result: ResultInfo) => ReactNode;
  /** Under the result text, for both outcomes. */
  resultNote?: (result: ResultInfo) => ReactNode;
  /** Under the "ends at" line while a session runs (M7: who you focus with). */
  running?: (session: RunningInfo) => ReactNode;
  /** Added to the end-early dialog (M7: that it ends the session for friends too). */
  cancelNote?: (session: RunningInfo) => ReactNode;
}
