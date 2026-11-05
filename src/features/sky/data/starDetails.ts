import {
  META_KEYS,
  type PomodoroRunRow,
  type SessionRow,
  type TagColor,
  type TagRow,
  type TogetherNamesMeta,
  type WorkTimerDb,
} from '@/shared/db';

/**
 * What the star card says about one of *your* stars beyond its time and length
 * (View sky upgrade PR 3): its tag, its place in a Pomodoro run, and who you
 * focused with. Read straight from `shared/db`, like the sky's sessions and the
 * stats' tags: features stay opaque to each other, and these tables are a
 * shared storage contract.
 *
 * Only ever for your own sky. A friend's sky gets none of it: their tags and
 * runs are theirs, and never reach this device anyway.
 */
export interface StarDetails {
  tag: { name: string; color: TagColor } | null;
  /** `total` is null while the run is still going: its length isn't known yet. */
  run: { index: number; total: number | null } | null;
  /**
   * Set for a focus-together session. `names` is who else was there, as this
   * device remembered them; null when it never knew (another device's room).
   */
  together: { names: readonly string[] | null } | null;
}

/** Everything `starDetails` needs, read in one flat go (safe inside a live query). */
export interface StarDetailsInputs {
  sessions: readonly SessionRow[];
  tags: readonly TagRow[];
  activeRun: PomodoroRunRow | undefined;
  togetherNames: TogetherNamesMeta | undefined;
}

/**
 * Flat on purpose: a live query whose body awaits nested async helpers can stop
 * re-running after its first answer (CLAUDE.md). Dexie calls only, then
 * plain code.
 */
export const readStarDetailsInputs = async (db: WorkTimerDb): Promise<StarDetailsInputs> => {
  const [sessions, tags, meta] = await Promise.all([
    db.sessions.toArray(),
    db.tags.toArray(),
    db.meta.bulkGet([META_KEYS.activeRun, META_KEYS.togetherNames]),
  ]);
  return {
    sessions,
    tags,
    activeRun: meta[0]?.value as PomodoroRunRow | undefined,
    togetherNames: meta[1]?.value as TogetherNamesMeta | undefined,
  };
};

/**
 * Details for every completed session, by session id.
 *
 * - **Tag:** archived tags still name old sessions; an id with no tag row (one
 *   deleted on a device before tags were archived, or not synced yet) shows none.
 * - **Pomodoro:** block `runIndex` of the number of blocks the run *completed*
 *   (the stars it earned), or of an unknown total while that run is still in
 *   flight on this device.
 * - **Together:** the names this device remembered for the room, if any.
 */
export const starDetails = ({
  sessions,
  tags,
  activeRun,
  togetherNames,
}: StarDetailsInputs): Map<string, StarDetails> => {
  const tagsById = new Map(tags.map((t) => [t.id, t]));

  const completedBlocks = new Map<string, number>();
  for (const s of sessions) {
    if (s.outcome !== 'completed' || s.runId === undefined || s.runIndex === undefined) continue;
    completedBlocks.set(s.runId, Math.max(completedBlocks.get(s.runId) ?? 0, s.runIndex));
  }

  const details = new Map<string, StarDetails>();
  for (const s of sessions) {
    if (s.outcome !== 'completed') continue;
    const tag = s.tagId === null ? undefined : tagsById.get(s.tagId);
    const inRun = s.mode === 'pomodoro' && s.runId !== undefined && s.runIndex !== undefined;
    details.set(s.id, {
      tag: tag === undefined ? null : { name: tag.name, color: tag.color },
      run: inRun
        ? {
            index: s.runIndex as number,
            total:
              activeRun?.id === s.runId ? null : (completedBlocks.get(s.runId as string) ?? null),
          }
        : null,
      together:
        s.togetherId === undefined ? null : { names: togetherNames?.[s.togetherId]?.names ?? null },
    });
  }
  return details;
};
