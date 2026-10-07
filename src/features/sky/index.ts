/**
 * Public entrypoint of the sky feature — the only module `app/` may import.
 */
export { SkyBackdrop } from './ui/SkyBackdrop';
export type { SkyMode } from './ui/ConstellationLayer';
export { StarGlyph } from './ui/StarGlyph';
export { NewStarNote, StartHint } from './ui/SkyNotes';
export { ConstellationStatus } from './ui/ConstellationStatus';

/** Install the dev console helpers. A no-op, and tree-shaken, in production. */
export const installDevTools = (): void => {
  if (import.meta.env.DEV) void import('./dev/devTools').then((m) => m.install());
};
