import type { LedgerRow, SessionRow } from '@/shared/db';
import { stableId } from '@/shared/lib';

import { bonusDays, goalReachedAt, goalRef } from './goal';
import {
  CONSTELLATION_BONUS,
  DEFAULT_DAILY_GOAL_MIN,
  GOAL_BONUS,
  sessionEarning,
  streakBonus,
  TOGETHER_BONUS,
  type BonusTier,
} from './economy';
import { lastEndByDay, streakRuns } from './streak';

/**
 * The ledger rows that *should* exist, computed from facts every device can
 * see (M6). The repository inserts whichever are missing; nothing else ever
 * credits Stardust.
 *
 * Each row's id is derived from the fact it pays for, so any device can run
 * this any number of times: the same session always maps to the same row, and
 * the server's insert-only "skip an existing id" collapses the copies. That is
 * what keeps a session finished on one device, synced to another, and
 * reconciled on both from paying twice — and what credits sessions recorded by
 * apps from before M6, which never wrote a ledger row at all.
 *
 * The key includes the account: the server's primary key is global, so without
 * it two people's identical facts would share an id and one would be dropped.
 * The `session:` namespace is permanent; a future change to how sessions earn
 * must use a new one (`session.v2:`) rather than re-pricing existing ids. The
 * same goes for the bonus namespaces below.
 *
 * Bonuses (goal, streak, constellation) follow the same rule, each paid once:
 * - `goal:<day>` — the day's focus reached the goal. Only today and yesterday
 *   are evaluated, so lowering the goal later never pays out old days.
 * - `streak:<run start>:<days>` — a run of consecutive days first reached a
 *   milestone. Past runs pay too. (A very late-arriving session that extends a
 *   run backwards moves its start day, which would pay its milestones again;
 *   that needs a session to sync in days late, and is accepted.)
 * - `constellation:<choice id>` — a constellation was finished, by tier.
 */

export const sessionKey = (userId: string, sessionId: string): string =>
  `${userId}:session:${sessionId}`;

/**
 * A purchase's id. Unlike the earnings it is written by the shop, not the
 * reconciler — but it follows the same rule: derived from what it is for, so
 * the same item bought on two offline devices is one row, and one deduction.
 */
export const purchaseKey = (userId: string, itemKey: string): string =>
  `${userId}:purchase:${itemKey}`;

/** A finished constellation, as the sky reports it. */
export interface ConstellationCompletion {
  choiceId: string;
  tier: BonusTier;
  completedAt: number;
}

/**
 * A focus-together room everyone completed (M7), as the server reports it:
 * only the server can see every member's session.
 */
export interface TogetherWin {
  roomId: string;
  /** Epoch ms: the room's shared end, the same on every device. */
  endsAt: number;
}

export interface ReconcileInput {
  userId: string;
  /** Every session; only the facts each rule needs are used. */
  sessions: readonly SessionRow[];
  completions?: readonly ConstellationCompletion[];
  togetherWins?: readonly TogetherWin[];
  goalMin?: number;
  /** Decides which days the goal bonus looks at. */
  now?: number;
}

const bonusRow = (
  userId: string,
  kind: 'goal' | 'streak' | 'constellation' | 'together',
  ref: string,
  delta: number,
  createdAt: number,
): LedgerRow => ({
  id: stableId(`${userId}:${kind}:${ref}`),
  reason: kind,
  delta,
  ref,
  createdAt,
  syncedAt: null,
});

export const expectedRows = ({
  userId,
  sessions,
  completions = [],
  togetherWins = [],
  goalMin = DEFAULT_DAILY_GOAL_MIN,
  now = Date.now(),
}: ReconcileInput): LedgerRow[] => {
  const rows: LedgerRow[] = [];
  for (const session of sessions) {
    const delta = sessionEarning(session);
    // A completed session under a minute earns nothing, and gets no row.
    if (delta <= 0 || session.endedAt === null) continue;
    rows.push({
      id: stableId(sessionKey(userId, session.id)),
      reason: 'session',
      delta,
      ref: session.id,
      // When the session ended, not when this device noticed: every device
      // mints a byte-identical row, whichever one gets there first.
      createdAt: session.endedAt,
      syncedAt: null,
    });
  }

  for (const day of bonusDays(now)) {
    const reachedAt = goalReachedAt(sessions, day, goalMin);
    if (reachedAt !== null) {
      rows.push(bonusRow(userId, 'goal', goalRef(day), GOAL_BONUS, reachedAt));
    }
  }

  const lastEnds = lastEndByDay(sessions);
  for (const run of streakRuns(sessions)) {
    run.days.forEach((day, index) => {
      const days = index + 1;
      const delta = streakBonus(days);
      if (delta > 0) {
        rows.push(
          bonusRow(userId, 'streak', `${run.startDay}:${days}`, delta, lastEnds.get(day) ?? 0),
        );
      }
    });
  }

  for (const c of completions) {
    rows.push(
      bonusRow(userId, 'constellation', c.choiceId, CONSTELLATION_BONUS[c.tier], c.completedAt),
    );
  }

  // Dated at the room's shared end, so every member's devices mint the same row.
  for (const win of togetherWins) {
    rows.push(bonusRow(userId, 'together', win.roomId, TOGETHER_BONUS, win.endsAt));
  }

  return rows;
};
