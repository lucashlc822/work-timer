import type { SessionRow } from '@/shared/db';

/**
 * Every number in Starkeep's economy lives in this file (M6), so tuning it is
 * one edit. Changing how an *existing* kind of row is computed is not tuning,
 * though: ledger ids are derived from what they pay for, so two app versions
 * computing different amounts for the same fact would race to insert it. A
 * changed rule gets a new id namespace (see `reconcile.ts`) and old rows stand.
 */

/** Stardust per whole focused minute of a completed session. */
export const STARDUST_PER_MINUTE = 1;

/**
 * What a session earns: whole focused minutes, completed sessions only. An
 * early ending earns nothing, just as it earns no star; each finished Pomodoro
 * block is its own session and earns for itself.
 */
export const sessionEarning = (session: Pick<SessionRow, 'outcome' | 'actualFocusS'>): number =>
  session.outcome === 'completed'
    ? Math.floor(Math.max(0, session.actualFocusS) / 60) * STARDUST_PER_MINUTE
    : 0;
