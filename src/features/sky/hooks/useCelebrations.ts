import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';

import { META_KEYS, writeMeta, type WorkTimerDb } from '@/shared/db';

import { pendingCelebrations, type FinishedConstellation } from '../domain/celebrate';

/** Between one constellation's moment and the next, when several play. */
export const CELEBRATION_STAGGER_MS = 1200;
/** How long one moment is kept on: the longest figure's lines, its art, and the bloom. */
export const CELEBRATION_HOLD_MS = 6000;
/**
 * Behind the timer, how long after the arriving star is lit that its
 * constellation's moment begins: long enough for the light to land first.
 */
export const HERO_CELEBRATION_DELAY_MS = 700;

/**
 * The completion moments playing now, as constellation id → start delay (ms).
 *
 * Reads the per-device record of what has been shown, decides with
 * `pendingCelebrations`, and records the decision at once, so a moment that
 * starts is never shown again, even if the sky closes part-way. The playing set
 * is held here, not derived from the record, so writing the record doesn't cut
 * the animation short. Nothing plays while `enabled` is false, but the
 * first-run record is still made then.
 *
 * `enabled: { only: id }` is the sky behind the timer (session-complete
 * redesign, PR 5): the star a session just placed finished constellation `id`,
 * so that one, and only that one, celebrates there now, after
 * `HERO_CELEBRATION_DELAY_MS`, and is recorded like any other. Anything else
 * unseen still waits for the full sky; the first-run rule is unchanged.
 */
export const useCelebrations = (
  db: WorkTimerDb,
  finished: readonly FinishedConstellation[] | undefined,
  enabled: boolean | { only: string },
): ReadonlyMap<string, number> => {
  const all = enabled === true;
  const only = typeof enabled === 'object' ? enabled.only : null;
  const on = all || only !== null;
  // `{ row }` rather than the row, so "not read yet" (undefined) and "never
  // recorded" ({ row: undefined }) are told apart. One flat Dexie call.
  const record = useLiveQuery(
    async () => ({ row: await db.meta.get(META_KEYS.celebratedConstellations) }),
    [db],
  );
  const [playing, setPlaying] = useState<ReadonlyMap<string, number>>(new Map());
  // Decided in this mount: the record can lag our own write by a render.
  const decided = useRef(new Set<string>());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // A stable key for the list, so a re-render with the same constellations is a no-op.
  const finishedKey = finished?.map((c) => `${c.id}:${String(c.completedAt)}`).join('|') ?? null;

  // Switched off, or moved between the full sky and the hero: whatever was
  // playing stops. The other view draws its own figures, so carrying a moment
  // across would start it again from the beginning there: played twice.
  useEffect(() => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
    setPlaying((now) => (now.size === 0 ? now : new Map()));
  }, [all, only]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    if (finished === undefined || record === undefined) return;
    const stored = record.row?.value;
    const seen = Array.isArray(stored) ? [...(stored as string[]), ...decided.current] : undefined;
    // The first-run record is made as soon as the sky has been read, even
    // behind the timer: otherwise a constellation finished before the sky is
    // first opened would be swallowed into it and never celebrated. Playing,
    // and deciding anything after that, waits for the full sky.
    if (seen !== undefined && !on) return;
    const pending = pendingCelebrations(finished, seen);
    // Behind the timer, just the constellation the arriving star finished.
    const narrowed =
      seen !== undefined && only !== null
        ? pending.markSeen.includes(only)
          ? { play: [only], markSeen: [only] }
          : { play: [], markSeen: [] }
        : pending;
    const { play, markSeen } = narrowed;
    const delay = only !== null ? HERO_CELEBRATION_DELAY_MS : 0;
    // The first run writes even an empty list, so the next finish is a real one.
    if (markSeen.length === 0 && seen !== undefined) return;

    for (const id of markSeen) decided.current.add(id);
    void writeMeta(db, META_KEYS.celebratedConstellations, [
      ...new Set([...(Array.isArray(stored) ? (stored as string[]) : []), ...markSeen]),
    ]);

    if (play.length === 0) return;
    setPlaying((now) => {
      const next = new Map(now);
      play.forEach((id, i) => next.set(id, delay + i * CELEBRATION_STAGGER_MS));
      return next;
    });
    play.forEach((id, i) => {
      timers.current.push(
        setTimeout(
          () =>
            setPlaying((now) => {
              if (!now.has(id)) return now;
              const next = new Map(now);
              next.delete(id);
              return next;
            }),
          delay + i * CELEBRATION_STAGGER_MS + CELEBRATION_HOLD_MS,
        ),
      );
    });
    // `finishedKey` stands for `finished`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, all, only, finishedKey, record]);

  return playing;
};
