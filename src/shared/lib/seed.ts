import { stableId } from './id';

/**
 * Dev-only seeded sessions (`window.__starkeep.seed`, `seedHistory`) carry this
 * device name. The server is insert-only for sessions and the ledger, so a
 * seeded row that uploaded could never be removed again; sync and the
 * reconciler therefore treat these rows as local-only.
 */
export const SEED_DEVICE = 'dev/seed';

/** The demo tags `seedHistory` creates. Fixed ids, so they can be recognised and removed. */
export const seedTagId = (name: string): string => stableId(`${SEED_DEVICE}:tag:${name}`);

export const isSeeded = (row: { device: string }): boolean => row.device === SEED_DEVICE;

export const SEED_TAG_NAMES = ['Writing', 'Reading', 'Admin'] as const;

const SEED_TAG_IDS: ReadonlySet<string> = new Set(SEED_TAG_NAMES.map(seedTagId));

export const isSeededTag = (id: string): boolean => SEED_TAG_IDS.has(id);
