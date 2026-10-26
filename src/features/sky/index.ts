/**
 * Public entrypoint of the sky feature — the only module `app/` may import.
 */
export { SkyBackdrop, SkyView } from './ui/SkyBackdrop';
export { completedConstellations, deriveOtherSky } from './domain/otherSky';
export type { OtherSession } from './domain/otherSky';
export { activeShared, deriveShared, sharedTitle } from './domain/shared';
export type { SharedInput, SharedState, SharedStatus } from './domain/shared';
export { SharedPicker, SharedStartHint, TargetPicker } from './ui/SharedSky';
export type { SharedPick } from './ui/ConstellationPicker';
export type { CompletedSession } from './domain/types';
export type { ConstellationChoice, SkyState } from './domain/types';
export type { SkyMode } from './ui/ConstellationLayer';
export { StarGlyph } from './ui/StarGlyph';
export { ResultStarGlyph } from './ui/ResultStarGlyph';
export { STAR_STYLE_KEYS } from './domain/starStyles';
export { SKY_THEME_KEYS } from './domain/skyThemes';
export { PACK_KEYS } from './domain/catalogue';
export { PackPreview } from './ui/PackPreview';
export { ThemeSwatch } from './ui/ThemeSwatch';
export { NewStarNote, StartHint } from './ui/SkyNotes';
export { ConstellationStatus } from './ui/ConstellationStatus';
export { useConstellationCompletions, useEarnedTiers } from './hooks/useSky';
export type { ConstellationCompletion } from './hooks/useSky';

/** Install the dev console helpers. A no-op, and tree-shaken, in production. */
export const installDevTools = (): void => {
  if (import.meta.env.DEV) void import('./dev/devTools').then((m) => m.install());
};
