import { LAVENDER_300 } from '../../../../design-tokens.mjs';

import { ATLAS_ART, type AtlasFigureArt } from '../domain/atlasArt';
import { artOpacity, outlineOpacity } from '../domain/atlasFade';
import { pathToPixels } from '../domain/atlasPath';
import type { Placement } from '../domain/layout';
import { figureOutline } from '../domain/outline';
import type { ConstellationDef } from '../domain/types';

/**
 * The engraved figure behind a constellation: a hand-drawn line drawing for a
 * catalogue shape, or a soft dotted outline for a generated ("wild") shape,
 * which has none. It grows clearer as stars fill in and is fully drawn once the
 * constellation is complete.
 *
 * Decorative: `aria-hidden`, no role, no name. Everything a person needs to
 * know about the constellation is in its caption and card.
 *
 * Drawn in pixels (the unit-square paths are scaled by number, not by a
 * transform), so a stroke is one width at every size.
 */
export interface AtlasFigureProps {
  def: ConstellationDef;
  box: Placement;
  /** 0 with no stars, 1 when it needs no more. */
  fill: number;
  complete: boolean;
}

/** Looked up by string: a stored key this build does not know is simply not found. */
const ART: Readonly<Partial<Record<string, AtlasFigureArt>>> = ATLAS_ART;

export const AtlasFigure = ({ def, box, fill, complete }: AtlasFigureProps) => {
  const art = def.source === 'catalogue' && def.shapeId !== null ? ART[def.shapeId] : undefined;

  if (art !== undefined) {
    return (
      <g
        aria-hidden
        data-atlas="art"
        fill="none"
        stroke={LAVENDER_300}
        strokeWidth={0.9}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={artOpacity(fill, complete)}
      >
        {art.paths.map((d) => (
          <path key={d} d={pathToPixels(d, box)} pathLength={1} />
        ))}
      </g>
    );
  }

  return (
    <path
      aria-hidden
      data-atlas="outline"
      d={pathToPixels(figureOutline(def.shape.points), box)}
      pathLength={1}
      fill="none"
      stroke={LAVENDER_300}
      strokeWidth={1}
      strokeLinecap="round"
      strokeDasharray="2 5"
      opacity={outlineOpacity(fill, complete)}
    />
  );
};
