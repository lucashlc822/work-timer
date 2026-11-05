import type { ConstellationRow, SessionRow, WorkTimerDb } from '@/shared/db';
import { newId, newSeed, SEED_DEVICE, seedConstellationId, type Clock } from '@/shared/lib';

import { CATALOGUE, type CatalogueKey } from '../domain/catalogue';
import { resolveDef } from '../domain/derive';
import { STAR_STYLE_KEYS } from '../domain/starStyles';
import {
  TIER_ORDER,
  type CompletedSession,
  type ConstellationChoice,
  type Tier,
} from '../domain/types';

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
        ...(row.starStyle !== undefined && { starStyle: row.starStyle }),
        ...(row.sharedId !== undefined && { sharedId: row.sharedId }),
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
      device: SEED_DEVICE,
      clientCreatedAt: now,
      syncedAt: null,
    };
  });
  await db.sessions.bulkAdd(rows);
};

export interface SeedSkyOptions {
  /** Which catalogue shapes to build: every one (default), or just these keys. */
  shapes?: 'all' | readonly CatalogueKey[];
  /** How many generated (non-catalogue) constellations to add after the catalogue ones. */
  generated?: number;
  /** Give every generated constellation this tier, instead of cycling easy, medium, hard. */
  tier?: Tier;
  /** Finish every constellation (default), or leave each one star short. */
  complete?: boolean;
  /** Stamp each star with a style, cycling through all of them in order. */
  styles?: boolean;
}

/** Long enough for every tier under production rules (hard needs 50+ minutes). */
const FIXTURE_FOCUS_MIN: Record<Tier, number> = { easy: 25, medium: 30, hard: 55 };
const DAY_MS = 86_400_000;
const SESSION_GAP_MS = 20 * 60_000;

/**
 * Dev only: a whole, reproducible sky. One constellation per chosen shape (then
 * any generated ones), each finished — or one star short — from sessions with
 * fixed seeds (`fixture-<name>-<i>`), so every run draws the same stars in the
 * same places. For screenshots, performance checks and drawing the atlas art.
 *
 * Everything is local-only: sessions carry `SEED_DEVICE`, and the choices get
 * ids `isSeededConstellation` recognises, so sync skips them, no Stardust is
 * paid for them, and `clearSeeded()` removes exactly these rows. Re-running
 * replaces the previous fixture instead of stacking a second one.
 *
 * Choices are two days apart, oldest first, all in the past, so each
 * constellation's window holds only its own sessions. Returns how many
 * constellations were written.
 */
export const seedSky = async (
  db: WorkTimerDb,
  opts: SeedSkyOptions,
  clock: Clock,
): Promise<number> => {
  const keys: readonly CatalogueKey[] =
    opts.shapes === undefined || opts.shapes === 'all'
      ? (Object.keys(CATALOGUE) as CatalogueKey[])
      : opts.shapes;
  const generated = opts.generated ?? 0;
  const complete = opts.complete ?? true;
  const total = keys.length + generated;
  const now = clock.now();

  const choiceRows: ConstellationRow[] = [];
  const sessionRows: SessionRow[] = [];
  let styleIndex = 0;

  for (let n = 0; n < total; n++) {
    const fromCatalogue = n < keys.length;
    const name = fromCatalogue ? (keys[n] as CatalogueKey) : `generated-${n - keys.length}`;
    const tier: Tier = fromCatalogue
      ? CATALOGUE[name as CatalogueKey].tier
      : (opts.tier ?? (TIER_ORDER[(n - keys.length) % TIER_ORDER.length] as Tier));
    const chosenAt = now - (total - n + 1) * 2 * DAY_MS;
    const draft: ChoiceDraft = fromCatalogue
      ? { source: 'catalogue', shapeId: name, seed: null, tier }
      : { source: 'generated', shapeId: null, seed: `fixture-${name}`, tier };
    const id = seedConstellationId(name);
    choiceRows.push({
      id,
      ...draft,
      chosenAt,
      clientCreatedAt: chosenAt,
      // Marked synced so nothing treats it as waiting to upload; sync also skips it by id.
      syncedAt: chosenAt,
    });

    const slots = resolveDef({ id, ...draft, chosenAt }).shape.points.length;
    const stars = complete ? slots : slots - 1;
    const minutes = FIXTURE_FOCUS_MIN[tier];
    for (let i = 0; i < stars; i++) {
      const endedAt = chosenAt + (i + 1) * SESSION_GAP_MS;
      sessionRows.push({
        id: seedConstellationId(`${name}:session:${i}`),
        mode: 'countdown',
        plannedDurationS: minutes * 60,
        actualFocusS: minutes * 60,
        startedAt: endedAt - minutes * 60_000,
        endedAt,
        outcome: 'completed',
        awayMs: 0,
        tagId: null,
        seed: `fixture-${name}-${i}`,
        ...(opts.styles === true && {
          starStyle: STAR_STYLE_KEYS[styleIndex++ % STAR_STYLE_KEYS.length] as string,
        }),
        device: SEED_DEVICE,
        clientCreatedAt: endedAt,
        syncedAt: null,
      });
    }
  }

  await db.transaction('rw', db.constellations, db.sessions, async () => {
    // Replace, don't stack: drop an earlier fixture first.
    await db.constellations.filter((c) => c.id.startsWith(seedConstellationId(''))).delete();
    await db.sessions.filter((s) => s.id.startsWith(seedConstellationId(''))).delete();
    await db.constellations.bulkAdd(choiceRows);
    await db.sessions.bulkAdd(sessionRows);
  });
  return total;
};
