import { themeSwatchBackground } from '../domain/skyThemes';

/** A small preview of a sky theme: its ground with a few clouds over it, for the shop. */
export const ThemeSwatch = ({ theme }: { theme: string }) => (
  <span
    aria-hidden="true"
    className="border-night-600 inline-block h-10 w-16 rounded-md border"
    style={{ background: themeSwatchBackground(theme) }}
  />
);
