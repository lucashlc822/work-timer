import { STAR_WHITE } from '../../../../design-tokens.mjs';

import type { Spike, StarForm } from '../domain/starForm';

/**
 * One star, drawn from its `StarForm`: a soft corona, thin diffraction spikes,
 * the coloured body and a white core.
 *
 * No `filter` anywhere. The old star was a blurred circle, and a crowded sky
 * meant hundreds of separate blur passes on every repaint. A radial gradient
 * gives the same soft falloff for the price of a fill, so the cost no longer
 * grows with the blur but only with the node count.
 *
 * Colours are concrete hex values, never `var(...)`: an unresolved custom
 * property inside a gradient stop renders black without a word.
 *
 * Draws only; the caller wraps it in whatever carries the hit area, the focus
 * ring, the twinkle and the accessible name.
 */
export interface AstroStarProps {
  x: number;
  y: number;
  form: StarForm;
  /** The star's own colour and peak opacity, from `starAppearance`. */
  color: string;
  brightness: number;
  /** Unique within the page: the corona's gradient is named from it. */
  id: string;
}

/** An id that is safe inside `url(#…)`; session ids can hold `:` and `/` in dev fixtures. */
const safe = (raw: string): string => raw.replace(/[^a-zA-Z0-9_-]/g, '_');

const fixed = (n: number): string => (Math.round(n * 100) / 100).toString();

/** A thin diamond tapering from the centre out to a point, as an absolute path. */
const spikePath = (x: number, y: number, s: Spike): string => {
  const hw = s.width / 2;
  const sin = Math.sin(s.angle);
  const cos = Math.cos(s.angle);
  return [
    `M${fixed(x - sin * hw)} ${fixed(y + cos * hw)}`,
    `L${fixed(x + cos * s.length)} ${fixed(y + sin * s.length)}`,
    `L${fixed(x + sin * hw)} ${fixed(y - cos * hw)}Z`,
  ].join('');
};

/** Spikes that share a colour and opacity are one path: fewer nodes in a crowded sky. */
const groupSpikes = (x: number, y: number, spikes: readonly Spike[]) => {
  const groups = new Map<string, { color: string; opacity: number; d: string }>();
  for (const s of spikes) {
    const key = `${s.color}|${s.opacity.toFixed(3)}`;
    const group = groups.get(key) ?? { color: s.color, opacity: s.opacity, d: '' };
    group.d += spikePath(x, y, s);
    groups.set(key, group);
  }
  return [...groups.values()];
};

export const AstroStar = ({ x, y, form, color, brightness, id }: AstroStarProps) => {
  const gradientId = `astro-${safe(id)}`;
  const { corona, ring } = form;
  return (
    <>
      <defs>
        <radialGradient id={gradientId}>
          {corona.stops.map((stop) => (
            <stop
              key={stop.offset}
              offset={stop.offset}
              stopColor={stop.color}
              stopOpacity={stop.opacity}
            />
          ))}
        </radialGradient>
      </defs>
      <ellipse cx={x} cy={y} rx={corona.rx} ry={corona.ry} fill={`url(#${gradientId})`} />
      {ring !== null && (
        <circle
          cx={x}
          cy={y}
          r={ring.r}
          fill="none"
          stroke={ring.color}
          strokeOpacity={ring.opacity}
          strokeWidth={0.75}
        />
      )}
      {groupSpikes(x, y, form.spikes).map((g) => (
        <path key={`${g.color}|${g.opacity}`} d={g.d} fill={g.color} opacity={g.opacity} />
      ))}
      <circle cx={x} cy={y} r={form.radius} fill={color} opacity={brightness} />
      <circle cx={x} cy={y} r={form.coreR} fill={STAR_WHITE} opacity={0.9} />
    </>
  );
};
