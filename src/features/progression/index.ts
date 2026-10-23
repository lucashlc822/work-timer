/**
 * Public entrypoint of the progression feature (M6) — the only module `app/`
 * may import. Stardust: earned by focus, recorded in an append-only ledger.
 */
export { useBoughtTiers, useOwnedPacks, useStardustReconciler } from './hooks/useStardust';
export { SHOP_PACK_KEYS, SHOP_STYLE_KEYS, SHOP_THEME_KEYS } from './domain/catalogue';
export { ProgressLine } from './ui/ProgressLine';
export { RewardNote } from './ui/RewardNote';
export { StardustPanel } from './ui/StardustPanel';
export { StardustPill } from './ui/StardustPill';
export { streakAt } from './domain/streak';
