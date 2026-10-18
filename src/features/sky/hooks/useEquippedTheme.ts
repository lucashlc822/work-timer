import { useLiveQuery } from 'dexie-react-hooks';

import { db, META_KEYS, readMeta } from '@/shared/db';

/**
 * The equipped sky theme's key, live. `undefined` until the first read, and
 * when none was ever equipped — both draw as the default night. Read straight
 * from the synced setting, so equipping on one device re-skins the others.
 */
export const useEquippedTheme = (): string | undefined =>
  useLiveQuery(async () => {
    const stored = await readMeta<unknown>(db, META_KEYS.skyTheme);
    return typeof stored === 'string' ? stored : undefined;
  }, []);
