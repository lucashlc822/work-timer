/**
 * Public entrypoint of the stats feature — the only module `app/` may import.
 */
export { StatsView } from './ui/StatsView';
export { totals } from './domain/aggregate';
export { periodContaining } from './domain/period';
export { formatFocus } from './domain/format';

/** Install the dev console helpers. A no-op, and tree-shaken, in production. */
export const installStatsDevTools = (): void => {
  if (import.meta.env.DEV) void import('./dev/devTools').then((m) => m.install());
};
