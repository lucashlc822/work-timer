import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';

import { db, type TagRow } from '@/shared/db';

import { listTags } from '../data/tagRepository';

export interface TagsState {
  /** False until the first read completes. */
  loaded: boolean;
  /** Every tag, archived included, oldest first. */
  all: TagRow[];
  /** The tags that can be picked: not archived. */
  active: TagRow[];
}

/** The tags, live — a tag created in the picker shows up everywhere at once. */
export const useTags = (): TagsState => {
  const rows = useLiveQuery(() => listTags(db), []);
  return useMemo(
    () => ({
      loaded: rows !== undefined,
      all: rows ?? [],
      active: (rows ?? []).filter((t) => t.archivedAt === null),
    }),
    [rows],
  );
};
