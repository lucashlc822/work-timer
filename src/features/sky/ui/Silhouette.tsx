import { LAVENDER_300 } from '../../../../design-tokens.mjs';

import type { ShapeDef } from '../domain/types';

/** A small preview of a shape: every star and line, unearned. */
export const Silhouette = ({ shape, size = 72 }: { shape: ShapeDef; size?: number }) => (
  <svg width={size} height={size} viewBox="-0.08 -0.08 1.16 1.16" aria-hidden="true">
    {shape.edges.map(([a, b]) => (
      <line
        key={`${a}-${b}`}
        x1={shape.points[a]![0]}
        y1={shape.points[a]![1]}
        x2={shape.points[b]![0]}
        y2={shape.points[b]![1]}
        stroke={LAVENDER_300}
        strokeOpacity={0.5}
        strokeWidth={0.015}
      />
    ))}
    {shape.points.map(([x, y], i) => (
      <circle key={i} cx={x} cy={y} r={0.03} fill={LAVENDER_300} />
    ))}
  </svg>
);
