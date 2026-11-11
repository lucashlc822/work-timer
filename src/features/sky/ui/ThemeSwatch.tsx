import { STAR_COOL, STAR_CORE, STAR_WARM } from '../../../../design-tokens.mjs';

import { skyThemeFor, themeSwatchBackground } from '../domain/skyThemes';

/** A fixed sprinkle of stars for the card size: where (in %), how big (px) and how bright. */
const SPRINKLE: readonly { x: number; y: number; r: number; o: number }[] = [
  { x: 8, y: 18, r: 1.2, o: 0.9 },
  { x: 17, y: 62, r: 0.8, o: 0.6 },
  { x: 24, y: 30, r: 0.7, o: 0.5 },
  { x: 33, y: 80, r: 1.1, o: 0.8 },
  { x: 41, y: 14, r: 0.8, o: 0.6 },
  { x: 49, y: 52, r: 1.4, o: 0.95 },
  { x: 57, y: 24, r: 0.7, o: 0.5 },
  { x: 64, y: 74, r: 0.9, o: 0.7 },
  { x: 72, y: 38, r: 1.2, o: 0.85 },
  { x: 79, y: 12, r: 0.7, o: 0.55 },
  { x: 86, y: 60, r: 1, o: 0.75 },
  { x: 92, y: 30, r: 0.8, o: 0.6 },
  { x: 12, y: 86, r: 0.7, o: 0.5 },
  { x: 90, y: 86, r: 0.8, o: 0.6 },
];

/**
 * A preview of a sky theme: its ground with a few clouds over it, for the shop.
 *
 * `sm` is the small chip. `card` fills a shop card's tile and adds a sprinkle of
 * background stars tinted by the theme's own star palette, so it reads as a sky
 * and not a smudge. Both are drawn from `themeSwatchBackground`.
 */
export const ThemeSwatch = ({
  theme,
  size = 'sm',
}: {
  theme: string;
  size?: 'sm' | 'card' | undefined;
}) => {
  if (size === 'sm') {
    return (
      <span
        aria-hidden="true"
        className="border-night-600 rounded-soft inline-block h-10 w-16 border"
        style={{ background: themeSwatchBackground(theme) }}
      />
    );
  }
  const palette = skyThemeFor(theme).starPalette;
  const tints = [
    palette?.cool ?? STAR_COOL,
    palette?.core ?? STAR_CORE,
    palette?.warm ?? STAR_WARM,
  ];
  return (
    <span
      aria-hidden="true"
      className="relative block h-28 w-full"
      style={{ background: themeSwatchBackground(theme) }}
    >
      <svg className="absolute inset-0 h-full w-full" focusable="false">
        {SPRINKLE.map((star, i) => (
          <circle
            key={i}
            cx={`${star.x}%`}
            cy={`${star.y}%`}
            r={star.r}
            fill={tints[i % tints.length]}
            fillOpacity={star.o}
          />
        ))}
      </svg>
    </span>
  );
};
