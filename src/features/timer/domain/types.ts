/**
 * Timer domain types.
 *
 * Built on top of `SessionRow` rather than replacing it: the row is what gets
 * persisted, these are what the timer reasons about. An `ActiveSession` is the
 * subset of a row that is meaningful while a session is still in flight —
 * there is no `endedAt` or `outcome` yet, so they are absent rather than null.
 */

export interface ActiveSession {
  id: string;
  /** Epoch ms. Elapsed time is always `now - startedAt`, never a tick count. */
  startedAt: number;
  plannedDurationS: number;
  seed: string;
  tagId: string | null;
  device: string;
  /** Informational only. Never affects whether the session succeeds. */
  awayMs: number;
}

/** What the user chose before pressing start. */
export interface SessionDraft {
  plannedDurationS: number;
  tagId: string | null;
}

/** The final fields written when a session stops being in flight. */
export interface SessionEnding {
  outcome: 'completed' | 'cancelled';
  /** Epoch ms. For a completion this is the *planned* end, not when it was noticed. */
  endedAt: number;
  actualFocusS: number;
}
