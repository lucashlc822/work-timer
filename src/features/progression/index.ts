/**
 * Public entrypoint of the progression feature (M6) — the only module `app/`
 * may import. Stardust: earned by focus, recorded in an append-only ledger.
 */
export { useStardustReconciler } from './hooks/useStardust';
export { ProgressLine } from './ui/ProgressLine';
export { RewardNote } from './ui/RewardNote';
export { StardustPanel } from './ui/StardustPanel';
export { StardustPill } from './ui/StardustPill';
