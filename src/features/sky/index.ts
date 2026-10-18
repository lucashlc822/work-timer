/**
 * Public entrypoint of the sky feature — the only module `app/` may import.
 */
export { SkyBackdrop } from './ui/SkyBackdrop';
export type { SkyMode } from './ui/ConstellationLayer';
export { StarGlyph } from './ui/StarGlyph';
export { ResultStarGlyph } from './ui/ResultStarGlyph';
export { STAR_STYLE_KEYS } from './domain/starStyles';
export { NewStarNote, StartHint } from './ui/SkyNotes';
export { ConstellationStatus } from './ui/ConstellationStatus';
export { useConstellationCompletions, useEarnedTiers } from './hooks/useSky';
export type { ConstellationCompletion } from './hooks/useSky';

/** Install the dev console helpers. A no-op, and tree-shaken, in production. */
export const installDevTools = (): void => {
  if (import.meta.env.DEV) void import('./dev/devTools').then((m) => m.install());
};
