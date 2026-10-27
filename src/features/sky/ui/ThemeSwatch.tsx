import { themeSwatchBackground } from '../domain/skyThemes';

/** A small preview of a sky theme: its ground with a few clouds over it, for the shop. */
export const ThemeSwatch = ({ theme }: { theme: string }) => (
  <span
    aria-hidden="true"
    className="border-night-600 rounded-soft inline-block h-10 w-16 border"
    style={{ background: themeSwatchBackground(theme) }}
  />
);
