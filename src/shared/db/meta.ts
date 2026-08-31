import { newId } from '../lib/id';
import { META_KEYS, type WorkTimerDb } from './schema';

/**
 * Typed accessors for the meta key/value store.
 *
 * `MetaRow.value` is `unknown` by necessity — the table holds heterogeneous
 * singletons — so every read is funnelled through here rather than being cast
 * at each call site.
 */

export const readMeta = async <T>(db: WorkTimerDb, key: string): Promise<T | undefined> => {
  const row = await db.meta.get(key);
  return row === undefined ? undefined : (row.value as T);
};

export const writeMeta = async (db: WorkTimerDb, key: string, value: unknown): Promise<void> => {
  await db.meta.put({ key, value });
};

export const clearMeta = async (db: WorkTimerDb, key: string): Promise<void> => {
  await db.meta.delete(key);
};

/**
 * The identity sessions are attributed to before the user has an account.
 *
 * Created lazily on first use and never changed. When an account is added
 * later (M5), the sync layer stamps these rows with the real user id and
 * uploads them — so guest history is claimed by an UPDATE, with no separate
 * migration path and nothing to lose.
 */
export const getLocalUserId = async (db: WorkTimerDb): Promise<string> => {
  const existing = await readMeta<string>(db, META_KEYS.localUserId);
  if (existing !== undefined) return existing;

  const created = newId();
  await writeMeta(db, META_KEYS.localUserId, created);
  return created;
};
