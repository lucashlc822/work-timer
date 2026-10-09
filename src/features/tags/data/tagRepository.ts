import type { TagColor, TagRow, WorkTimerDb } from '@/shared/db';
import { newId, type Clock } from '@/shared/lib';

import {
  MAX_ACTIVE_TAGS,
  normalizeTagName,
  validateTagName,
  type TagNameError,
} from '../domain/tags';

/**
 * Persistence for tags.
 *
 * Tags are the one mutable table: rename, recolour and archive all rewrite
 * the row, bump `updatedAt`, and clear `syncedAt` so sync uploads the change. Validation runs inside the write transaction
 * so two quick creates can't both pass the duplicate check.
 */

export class TagNameInvalidError extends Error {
  readonly reason: TagNameError;

  constructor(reason: TagNameError) {
    super(`Invalid tag name: ${reason}`);
    this.reason = reason;
    this.name = 'TagNameInvalidError';
  }
}

export class TagLimitError extends Error {
  constructor() {
    super(`At most ${MAX_ACTIVE_TAGS} active tags.`);
    this.name = 'TagLimitError';
  }
}

const countActive = (tags: readonly TagRow[]): number =>
  tags.filter((t) => t.archivedAt === null).length;

export const listTags = async (db: WorkTimerDb): Promise<TagRow[]> =>
  (await db.tags.toArray()).sort((a, b) => a.createdAt - b.createdAt);

export const createTag = (
  db: WorkTimerDb,
  input: { name: string; color: TagColor },
  clock: Clock,
): Promise<TagRow> =>
  db.transaction('rw', db.tags, async () => {
    const all = await db.tags.toArray();
    const reason = validateTagName(input.name, all);
    if (reason !== null) throw new TagNameInvalidError(reason);
    if (countActive(all) >= MAX_ACTIVE_TAGS) throw new TagLimitError();

    const now = clock.now();
    const row: TagRow = {
      id: newId(),
      name: normalizeTagName(input.name),
      color: input.color,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      syncedAt: null,
    };
    await db.tags.add(row);
    return row;
  });

export const renameTag = (db: WorkTimerDb, id: string, name: string, clock: Clock): Promise<void> =>
  db.transaction('rw', db.tags, async () => {
    const all = await db.tags.toArray();
    const reason = validateTagName(name, all, id);
    if (reason !== null) throw new TagNameInvalidError(reason);
    await db.tags.update(id, {
      name: normalizeTagName(name),
      updatedAt: clock.now(),
      syncedAt: null,
    });
  });

export const recolorTag = (
  db: WorkTimerDb,
  id: string,
  color: TagColor,
  clock: Clock,
): Promise<void> =>
  db.transaction('rw', db.tags, async () => {
    await db.tags.update(id, { color, updatedAt: clock.now(), syncedAt: null });
  });

/**
 * Archive or restore. Restoring re-checks the rules an archived tag was
 * exempt from: its name must still be free, and there must be room.
 */
export const setArchived = (
  db: WorkTimerDb,
  id: string,
  archived: boolean,
  clock: Clock,
): Promise<void> =>
  db.transaction('rw', db.tags, async () => {
    const now = clock.now();
    if (archived) {
      await db.tags.update(id, { archivedAt: now, updatedAt: now, syncedAt: null });
      return;
    }
    const all = await db.tags.toArray();
    const row = all.find((t) => t.id === id);
    if (row === undefined) return;
    const reason = validateTagName(row.name, all, id);
    if (reason !== null) throw new TagNameInvalidError(reason);
    if (countActive(all) >= MAX_ACTIVE_TAGS) throw new TagLimitError();
    await db.tags.update(id, { archivedAt: null, updatedAt: now, syncedAt: null });
  });
