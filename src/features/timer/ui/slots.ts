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
}
