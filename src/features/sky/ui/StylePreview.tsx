import { useId } from 'react';

import { starAppearance } from '../domain/starAppearance';
import { starForm } from '../domain/starForm';
import { AstroStar } from './AstroStar';

/** The preview's box, and the radius a default star gets inside it. */
const BOX = 40;
const BASE_R = 4.6;

/**
 * One star in one style, drawn the way the sky draws it, for the shop.
 *
 * It uses the same `starAppearance` -> `starForm` -> `AstroStar` path as a star
 * in the sky, at the `glow` tier (a medium constellation's reach), so what the
 * buyer sees is the character the style will really have: its spike count and
 * angle, its corona, its ring. Every style gets the same seed and the same
 * length of session, so the only difference between two previews is the style.
 * The result screen draws the same way (`ResultStar`), from the session's own seed.
 *
 * Static on purpose (no twinkle): a shop row is a place to compare, not watch.
 * Decorative: the row's own text names the style.
 */
export const StylePreview = ({
  styleKey,
  seed = 'shop-preview',
  focusS = 1500,
  size = BOX,
}: {
  styleKey: string;
  seed?: string;
  focusS?: number;
  /** The drawn size in px; the star is scaled, not redrawn, so it looks the same bigger. */
  size?: number | undefined;
}) => {
  const id = `style-${useId()}`;
  const look = starAppearance(seed, focusS, styleKey);
  const form = starForm(look, focusS, styleKey, BASE_R, 'glow');
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${BOX} ${BOX}`}
      aria-hidden="true"
      focusable="false"
      className="overflow-visible"
      data-style={styleKey}
    >
      <AstroStar
        x={BOX / 2}
        y={BOX / 2}
        form={form}
        color={look.color}
        brightness={look.brightness}
        id={id}
      />
    </svg>
  );
};
