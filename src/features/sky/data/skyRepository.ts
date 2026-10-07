import type { ConstellationRow, SessionRow, WorkTimerDb } from '@/shared/db';
import { newId, newSeed, type Clock } from '@/shared/lib';

import type { CompletedSession, ConstellationChoice, Tier } from '../domain/types';

/**
 * Persistence for the sky.
 *
 * The sky writes exactly one kind of thing: a constellation choice. It reads
 * completed sessions straight from `shared/db` rather than through the timer
 * feature — features stay opaque to each other, and the session row is a
 * shared storage contract, not timer internals.
 */

export interface ChoiceDraft {
  source: 'catalogue' | 'generated';
  shapeId: string | null;
  seed: string | null;
  tier: Tier;
}

const toChoice = (row: ConstellationRow): ConstellationChoice => ({
  id: row.id,
  source: row.source,
  shapeId: row.shapeId,
  seed: row.seed,
  tier: row.tier,
  chosenAt: row.chosenAt,
});

const toCompleted = (row: SessionRow): CompletedSession | null =>
  row.outcome === 'completed' && row.endedAt !== null
    ? {
        id: row.id,
        seed: row.seed,
        startedAt: row.startedAt,
        endedAt: row.endedAt,
        actualFocusS: row.actualFocusS,
      }
    : null;

/** Start building a constellation. Always appends; never edits an earlier choice. */
export const chooseConstellation = async (
  db: WorkTimerDb,
  draft: ChoiceDraft,
  clock: Clock,
): Promise<ConstellationChoice> => {
  const now = clock.now();
  const row: ConstellationRow = {
    id: newId(),
    ...draft,
    chosenAt: now,
    clientCreatedAt: now,
    syncedAt: null,
  };
  await db.constellations.add(row);
  return toChoice(row);
};

export interface SkyInputs {
  sessions: CompletedSession[];
  choices: ConstellationChoice[];
}

/**
 * Everything `deriveSky` needs. Read-only, so it is safe inside a Dexie
 * `liveQuery`, which re-runs whenever either table changes.
 *
 * A full scan of sessions: `outcome` is deliberately unindexed (see the
 * schema), and a few thousand rows is trivial. Revisit if that ever changes.
 */
export const readSkyInputs = async (db: WorkTimerDb): Promise<SkyInputs> => {
  const [sessionRows, choiceRows] = await Promise.all([
    db.sessions.toArray(),
    db.constellations.orderBy('chosenAt').toArray(),
  ]);
  return {
    sessions: sessionRows.map(toCompleted).filter((s): s is CompletedSession => s !== null),
    choices: choiceRows.map(toChoice),
  };
};

/**
 * Dev only: write `count` completed sessions of `minutes` each, ending just
 * after now, so they land in whatever constellation is current. For exercising
 * tiers and gating without hours of real sessions. Never reachable in a
 * production build — see `dev/devTools.ts`.
 */
export const seedCompletedSessions = async (
  db: WorkTimerDb,
  count: number,
  minutes: number,
  clock: Clock,
): Promise<void> => {
  const now = clock.now();
  const rows: SessionRow[] = Array.from({ length: count }, (_, i) => {
    const endedAt = now + i + 1;
    return {
      id: newId(),
      mode: 'countdown',
      plannedDurationS: minutes * 60,
      actualFocusS: minutes * 60,
      startedAt: endedAt - minutes * 60_000,
      endedAt,
      outcome: 'completed',
      awayMs: 0,
      tagId: null,
      seed: newSeed(),
      device: 'dev/seed',
      clientCreatedAt: now,
      syncedAt: null,
    };
  });
  await db.sessions.bulkAdd(rows);
};
