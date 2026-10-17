import type { LedgerRow, SessionRow } from '@/shared/db';
import { stableId } from '@/shared/lib';

import { sessionEarning } from './economy';

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
 * must use a new one (`session.v2:`) rather than re-pricing existing ids.
 */

export const sessionKey = (userId: string, sessionId: string): string =>
  `${userId}:session:${sessionId}`;

export interface ReconcileInput {
  userId: string;
  sessions: readonly SessionRow[];
}

export const expectedRows = ({ userId, sessions }: ReconcileInput): LedgerRow[] => {
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
  return rows;
};
