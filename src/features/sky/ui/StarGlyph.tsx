import { useId } from 'react';

import { starAppearance } from '../domain/starAppearance';

/**
 * One earned star, drawn large: the moment a session becomes a star.
 *
 * The same four-pointed silhouette as `shared/ui/StarMark`, but coloured by the
 * session's seed — so the star on the result screen is recognisably the one
 * that just appeared in the sky. Colours are hex, never `var(...)`.
 */
export const StarGlyph = ({
  seed,
  focusS,
  size = 80,
}: {
  seed: string;
  focusS: number;
  size?: number;
}) => {
  const id = `glyph${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const look = starAppearance(seed, focusS);

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={`${id}-halo`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={look.color} stopOpacity={0.55 * look.brightness} />
          <stop offset="60%" stopColor={look.color} stopOpacity={0.12} />
          <stop offset="100%" stopColor={look.color} stopOpacity={0} />
        </radialGradient>
        <radialGradient id={`${id}-core`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="45%" stopColor={look.color} />
          <stop offset="100%" stopColor={look.color} stopOpacity={0.85} />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill={`url(#${id}-halo)`} />
      <path
        d="M32 4 C34 24 40 30 60 32 C40 34 34 40 32 60 C30 40 24 34 4 32 C24 30 30 24 32 4 Z"
        fill={`url(#${id}-core)`}
        transform={`translate(32 32) scale(${0.75 + look.radius * 0.17}) translate(-32 -32)`}
      />
    </svg>
  );
};
