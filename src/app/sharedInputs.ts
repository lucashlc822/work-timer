import type { SharedRow, SharedSession } from '@/features/friends';
import type { SharedCompletion } from '@/features/progression';
import { deriveShared, type CompletedSession, type SharedInput } from '@/features/sky';
import type { SessionRow } from '@/shared/db';

/**
 * Shared constellations (M7 phase 5), where the friends, sky and progression
 * features meet. Friends fetches the rows, the sky derives which stars fill
 * them, and progression pays for the finished ones — none of them imports
 * another; this is the one place they are put together.
 *
 * Two derivations of the same rows, on purpose:
 * - **shown** adds this device's own sessions run for each one, so a star you
 *   just earned appears at once, before it has synced;
 * - **paid** uses only the sessions the server sent, so a device never pays for
 *   a star the server hasn't got. Both members' devices then pay at the same
 *   moment, for the same last star.
 */

const fromServer = (s: SharedSession, sharedId: string): CompletedSession => ({
  id: s.id,
  seed: s.seed,
  startedAt: s.startedAt,
  endedAt: s.endedAt,
  actualFocusS: s.actualFocusS,
  sharedId,
  ...(s.starStyle !== undefined && { starStyle: s.starStyle }),
});

/** A session of this device's run for a shared constellation, once completed. */
export const fromDevice = (s: SessionRow): CompletedSession | null =>
  s.outcome === 'completed' && s.endedAt !== null && s.sharedId !== undefined
    ? {
        id: s.id,
        seed: s.seed,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        actualFocusS: s.actualFocusS,
        sharedId: s.sharedId,
        ...(s.starStyle !== undefined && { starStyle: s.starStyle }),
      }
    : null;

/** One server row as the sky's input, with any extra sessions of your own. */
export const toSharedInput = (
  row: SharedRow,
  own: readonly CompletedSession[] = [],
): SharedInput => ({
  id: row.id,
  partnerName: row.partnerName ?? 'a friend',
  choice: {
    id: row.id,
    source: row.source,
    shapeId: row.shapeId,
    seed: row.seed,
    tier: row.tier,
    chosenAt: row.acceptedAt ?? row.createdAt,
  },
  starsNeeded: row.starsNeeded,
  minFocusS: row.minFocusS,
  acceptedAt: row.acceptedAt,
  stoppedAt: row.stoppedAt,
  sessions: [
    ...row.sessions.map((s) => fromServer(s, row.id)),
    ...own.filter((s) => s.sharedId === row.id),
  ],
});

/** Finished by the server's sessions alone: what may be paid. */
export const sharedCompletions = (rows: readonly SharedRow[]): SharedCompletion[] =>
  rows.flatMap((row) => {
    const state = deriveShared(toSharedInput(row));
    return state.completedAt === null
      ? []
      : [{ sharedId: row.id, tier: row.tier, completedAt: state.completedAt }];
  });
