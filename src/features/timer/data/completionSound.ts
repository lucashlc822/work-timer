import { META_KEYS, readMeta, writeMeta, type WorkTimerDb } from '@/shared/db';
import { playChime } from '@/shared/lib';

import { shouldChime } from '../domain/moment';

/** On unless this device turned it off: absent (never chosen) is on. */
export const readCompletionSound = async (db: WorkTimerDb): Promise<boolean> =>
  (await readMeta<unknown>(db, META_KEYS.completionSound)) !== false;

export const writeCompletionSound = (db: WorkTimerDb, on: boolean): Promise<void> =>
  writeMeta(db, META_KEYS.completionSound, on);

/**
 * The chime for a completion moment that has just started at `startedAt`:
 * plays if this device hasn't turned it off and the moment began within
 * `CHIME_WINDOW_MS` of the session's end (so one that ended in the tray half
 * an hour ago doesn't sound when the window comes back). Never throws: a sound
 * must not break the result.
 */
export const chimeIfWanted = async (
  db: WorkTimerDb,
  endedAt: number,
  startedAt: number,
): Promise<void> => {
  try {
    if (!shouldChime(endedAt, startedAt)) return;
    if (!(await readCompletionSound(db))) return;
    playChime();
  } catch {
    /* no store open (a test), or no audio */
  }
};
