import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

import { LAVENDER_300, LAVENDER_400, MINT_300, ROSE_300 } from '../../../../design-tokens.mjs';
import { hashSeed } from '@/shared/lib';

import {
  gridPlacements,
  heroPlacement,
  toPixels,
  wanderingPosition,
  type Placement,
} from '../domain/layout';
import { isShared, type SharedState } from '../domain/shared';
import { starAppearance } from '../domain/starAppearance';
import { starForm, type TierStyle } from '../domain/starForm';
import { TIERS } from '../domain/tiers';
import type { CompletedSession, ConstellationState, SkyState } from '../domain/types';
import { AstroStar } from './AstroStar';
import { AtlasFigure } from './AtlasFigure';
import { figureCaption, progressLabel, starLabel, wanderingStarLabel } from './describe';

export type SkyMode = 'hero' | 'full';

interface Props {
  sky: SkyState;
  mode: SkyMode;
  width: number;
  height: number;
  /** Shared constellations (M7 phase 5), drawn after your own; proposals are not drawn. */
  shared?: readonly SharedState[];
  /** In hero mode, the shared constellation the next session is for, if any. */
  focusId?: string | null;
  /**
   * Full mode only: told when a star is hovered or focused, and when it stops
   * being, so the sky can show a card about it.
   */
  onStar?: (event: StarEvent, target: StarTarget) => void;
  /** Full mode only: the star's description (its `<desc>`), when there's one to give. */
  describeStar?: (star: StarRef) => string | undefined;
  /**
   * Full mode only: told when a constellation is hovered (anywhere on it, its
   * stars included) or its caption focused, and when it stops being. Captions
   * become keyboard stops only when this is given.
   */
  onFigure?: (event: StarEvent, target: FigureTarget) => void;
  /** Full mode only: the constellation's description (its caption's `<desc>`). */
  describeFigure?: (constellation: ConstellationState) => string | undefined;
  /** The constellation being looked at: it stays bright while the others dim. */
  activeFigureId?: string | null;
}

/** A constellation as it sits on screen: its centre and half its box. */
export interface FigureTarget {
  constellation: ConstellationState;
  x: number;
  y: number;
  r: number;
}

/** How far the other constellations fade while one is being looked at. */
export const DIMMED = 0.35;

export type StarEvent = 'enter' | 'leave' | 'focus' | 'blur';

/** A star, and the constellation it belongs to (null for a wandering star). */
export interface StarRef {
  session: CompletedSession;
  constellation: ConstellationState | null;
  tier: TierStyle;
}

/** A star as it sits on screen, in the sky's own pixels. */
export interface StarTarget extends StarRef {
  x: number;
  y: number;
  /** Its visible radius. */
  r: number;
}

/** Pointer and focus handlers that report a star upward. */
const starHandlers = (
  onStar: Props['onStar'],
  target: StarTarget,
): Partial<Record<'onPointerEnter' | 'onPointerLeave' | 'onFocus' | 'onBlur', () => void>> =>
  onStar === undefined
    ? {}
    : {
        onPointerEnter: () => onStar('enter', target),
        onPointerLeave: () => onStar('leave', target),
        onFocus: () => onStar('focus', target),
        onBlur: () => onStar('blur', target),
      };

const NO_SHARED: readonly SharedState[] = [];

/**
 * The earned sky, in SVG: constellations and wandering stars.
 *
 * SVG rather than canvas because these stars are *yours*: they need to be
 * hoverable, focusable, and announced to a screen reader, which canvas pixels
 * cannot be.
 *
 * Two modes. **Hero** sits behind the timer: just the constellation being
 * built (or the latest one), static, non-interactive, so a long session costs
 * nothing to repaint. **Full** is the "View sky" mode: every constellation in a
 * grid, labelled, focusable, with twinkle and shimmer.
 *
 * Colours are concrete hex values from the token mirror, never `var(...)`: an
 * unresolved custom property in a gradient stop renders black silently.
 */
export const ConstellationLayer = ({
  sky,
  mode,
  width,
  height,
  shared = NO_SHARED,
  focusId = null,
  onStar,
  describeStar,
  onFigure,
  describeFigure,
  activeFigureId = null,
}: Props) => {
  // useId output contains `:` or `«»`, which are fragile inside url(#...).
  const glowId = `sky${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const full = mode === 'full';

  // An abandoned constellation with no stars is an empty outline: not worth showing.
  const visible: ConstellationState[] = [
    ...sky.constellations.filter((c) => !(c.abandoned && c.stars.length === 0)),
    ...shared.filter((s) => s.status !== 'proposed'),
  ];
  const focused = shared.find((s) => s.choice.id === focusId && s.status === 'active');
  const shown: { state: ConstellationState; box: Placement }[] = full
    ? gridPlacements(visible.length, width, height).map((box, i) => ({ state: visible[i]!, box }))
    : focused !== undefined
      ? [{ state: focused, box: heroPlacement(width, height) }]
      : heroShown(sky, width, height);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="absolute inset-0"
      aria-hidden={full ? undefined : true}
      role={full ? 'group' : undefined}
      aria-label={full ? 'Your sky' : undefined}
      data-active={full && activeFigureId !== null ? activeFigureId : undefined}
    >
      <defs>
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
      </defs>

      {sky.wandering.map(({ session }) => {
        const [x, y] = wanderingPosition(session.seed, width, height);
        const look = starAppearance(session.seed, session.actualFocusS, session.starStyle);
        // Smaller than a star in a constellation, with shorter spikes: it belongs to nothing.
        const form = starForm(look, session.actualFocusS, session.starStyle, 1.3, 'plain', {
          spikeScale: 0.6,
        });
        const label = wanderingStarLabel(session.endedAt, session.actualFocusS);
        const ref: StarRef = { session, constellation: null, tier: 'plain' };
        const description = full ? describeStar?.(ref) : undefined;
        return (
          <g
            key={session.id}
            tabIndex={full ? 0 : undefined}
            role={full ? 'img' : undefined}
            aria-label={full ? label : undefined}
            className="group focus:outline-none"
            {...(full ? starHandlers(onStar, { ...ref, x, y, r: form.radius }) : {})}
          >
            {description !== undefined && <desc>{description}</desc>}
            {full && <HitArea x={x} y={y} />}
            <g opacity={full ? 0.8 : 0.5}>
              <AstroStar
                x={x}
                y={y}
                form={form}
                color={look.color}
                brightness={look.brightness}
                id={`${glowId}-w-${session.id}`}
              />
            </g>
            {full && <FocusRing x={x} y={y} r={Math.max(1, form.radius)} />}
          </g>
        );
      })}

      {shown.map(({ state, box }) => (
        <Figure
          key={state.choice.id}
          state={state}
          box={box}
          full={full}
          glowId={glowId}
          viewWidth={width}
          onStar={onStar}
          describeStar={describeStar}
          onFigure={full ? onFigure : undefined}
          describeFigure={describeFigure}
          // With one constellation there is nothing to set it apart from.
          dimmed={
            full &&
            shown.length > 1 &&
            activeFigureId !== null &&
            state.choice.id !== activeFigureId
          }
          active={full && state.choice.id === activeFigureId}
        />
      ))}
    </svg>
  );
};

/**
 * An invisible 24x24 target around a star (WCAG 2.5.8): the visible star is
 * often smaller, and the group's box is what a pointer or an audit measures.
 */
const HitArea = ({ x, y }: { x: number; y: number }) => (
  <circle cx={x} cy={y} r={12} fill="transparent" />
);

/**
 * A keyboard focus ring for a star. Stars are SVG groups, where the global
 * `:focus-visible` outline would box the whole glow, so the group hides its
 * outline and shows this circle instead (WCAG 2.4.7).
 */
const FocusRing = ({ x, y, r }: { x: number; y: number; r: number }) => (
  <circle
    cx={x}
    cy={y}
    r={r + 5}
    fill="none"
    strokeWidth={2}
    className="stroke-lavender-300 opacity-0 group-focus-visible:opacity-100"
  />
);

/** Behind the timer: the constellation in progress, else the most recent one. */
const heroShown = (sky: SkyState, width: number, height: number) => {
  const state = sky.current ?? sky.constellations.filter((c) => c.stars.length > 0).at(-1);
  return state === undefined ? [] : [{ state, box: heroPlacement(width, height) }];
};

/** Keep a caption this far from the window's left and right edges. */
const CAPTION_EDGE = 8;

/**
 * The words under a figure, in the atlas type. Small capitals with wide
 * tracking run wider than the figure's own cell, and the last column's caption
 * (a shared constellation's "The Kite · with Bea · 1/4" is the longest) would be
 * clipped by the window at narrow widths. So it is measured once drawn and nudged
 * back inside the edges. Re-measured when the web font arrives, since the
 * fallback face has different widths.
 */
const Caption = ({
  text,
  cx,
  y,
  fontSize,
  nebula,
  viewWidth,
  focus,
}: {
  text: string;
  cx: number;
  y: number;
  fontSize: number;
  nebula: boolean;
  viewWidth: number;
  /** Makes the caption the constellation's keyboard stop (View sky upgrade PR 4). */
  focus?: {
    label: string;
    description: string | undefined;
    onFocus: () => void;
    onBlur: () => void;
  };
}) => {
  const ref = useRef<SVGTextElement>(null);
  const [dx, setDx] = useState(0);
  // Until measured (and always in jsdom), a fair guess at small capitals' width.
  const [width, setWidth] = useState(text.length * fontSize * 0.62);
  const [fontEpoch, setFontEpoch] = useState(0);

  useEffect(() => {
    const fonts = typeof document === 'undefined' ? undefined : document.fonts;
    if (fonts === undefined) return;
    const bump = () => setFontEpoch((n) => n + 1);
    fonts.addEventListener('loadingdone', bump);
    return () => fonts.removeEventListener('loadingdone', bump);
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    // jsdom has no text metrics: leave the caption centred there.
    if (el === null || typeof el.getComputedTextLength !== 'function') return;
    const measured = el.getComputedTextLength();
    setWidth(measured);
    const half = measured / 2;
    const lowest = CAPTION_EDGE + half;
    const highest = viewWidth - CAPTION_EDGE - half;
    // A caption wider than the window itself stays centred rather than flip-flopping.
    const x = highest < lowest ? cx : Math.min(Math.max(cx, lowest), highest);
    setDx(x - cx);
  }, [text, cx, fontSize, nebula, viewWidth, fontEpoch]);

  const words = (
    <text
      ref={ref}
      x={cx + dx}
      y={y}
      textAnchor="middle"
      fill={LAVENDER_300}
      fillOpacity={0.75}
      fontSize={fontSize}
      className="font-atlas"
      fontWeight={500}
      fontStyle={nebula ? 'italic' : undefined}
      style={{
        letterSpacing: nebula ? 'calc(var(--tracking-atlas) * 2)' : 'var(--tracking-atlas)',
        fontVariantNumeric: 'oldstyle-nums',
      }}
    >
      {text}
    </text>
  );
  if (focus === undefined) return words;

  // A target at least 24 px tall (WCAG 2.5.8) around the words, and a ring on it
  // for the keyboard (2.4.7): the global outline would box the SVG oddly.
  const height = Math.max(24, fontSize + 12);
  const box = {
    x: cx + dx - width / 2 - 6,
    y: y - fontSize - (height - fontSize) / 2 + 3,
    width: width + 12,
    height,
  };
  return (
    <g
      tabIndex={0}
      role="img"
      aria-label={focus.label}
      className="group focus:outline-none"
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
    >
      {focus.description !== undefined && <desc>{focus.description}</desc>}
      <rect {...box} fill="transparent" />
      <rect
        {...box}
        rx={6}
        fill="none"
        strokeWidth={1.5}
        className="stroke-lavender-300 opacity-0 group-focus-visible:opacity-100"
      />
      {words}
    </g>
  );
};

const NEBULA_HUES = [LAVENDER_400, ROSE_300, MINT_300];

const Figure = ({
  state,
  box,
  full,
  glowId,
  viewWidth,
  onStar,
  describeStar,
  onFigure,
  describeFigure,
  dimmed,
  active,
}: {
  state: ConstellationState;
  box: Placement;
  full: boolean;
  glowId: string;
  viewWidth: number;
  onStar: Props['onStar'];
  describeStar: Props['describeStar'];
  onFigure: Props['onFigure'];
  describeFigure: Props['describeFigure'];
  dimmed: boolean;
  active: boolean;
}) => {
  const { def, stars, complete } = state;
  // A stopped shared constellation fades like an abandoned one of your own.
  const faded = state.abandoned || (isShared(state) && state.status === 'stopped');
  const style = TIERS[def.tier].style;
  const points = def.shape.points.map((p) => toPixels(p, box));
  const filled = (i: number) => i < stars.length;
  const earnedEdges = def.shape.edges.filter(([a, b]) => filled(a) && filled(b));
  // How near it is to done: a shared one needs only what it was agreed to need.
  const needed = isShared(state) ? state.starsNeeded : points.length;
  const fill = complete || needed === 0 ? 1 : Math.min(1, stars.length / needed);
  const starRadius = Math.max(2, box.size * 0.016);
  const nebulaHue = NEBULA_HUES[hashSeed(state.choice.id) % NEBULA_HUES.length]!;
  const gradientId = `${glowId}-nebula-${state.choice.id}`;
  const figure: FigureTarget = {
    constellation: state,
    x: box.x + box.size / 2,
    y: box.y + box.size / 2,
    r: box.size / 2,
  };
  // Faded (abandoned, or a stopped shared one) unless it is the one looked at.
  const base = faded && !active ? 0.45 : 1;

  return (
    <g
      data-figure={full ? state.choice.id : undefined}
      role={full ? 'group' : undefined}
      aria-label={full ? progressLabel(state) : undefined}
      style={full ? { opacity: base * (dimmed ? DIMMED : 1) } : { opacity: base }}
      className={full ? 'ease-gentle transition-opacity duration-500' : undefined}
      {...(onFigure !== undefined && {
        onPointerEnter: () => onFigure('enter', figure),
        onPointerLeave: () => onFigure('leave', figure),
      })}
    >
      {/* The whole box answers the pointer, not just the thin lines and stars. */}
      {onFigure !== undefined && (
        <rect x={box.x} y={box.y} width={box.size} height={box.size} fill="transparent" />
      )}

      {/* First in the figure, so a keyboard reaches the constellation before its stars. */}
      {full && (
        <Caption
          text={figureCaption(state)}
          cx={box.x + box.size / 2}
          y={box.y + box.size + Math.max(14, box.size * 0.1)}
          fontSize={Math.max(11, Math.min(14, box.size * 0.07))}
          nebula={style === 'nebula'}
          viewWidth={viewWidth}
          {...(onFigure !== undefined && {
            focus: {
              label: progressLabel(state),
              description: describeFigure?.(state),
              onFocus: () => onFigure('focus', figure),
              onBlur: () => onFigure('blur', figure),
            },
          })}
        />
      )}

      {style === 'nebula' && (
        <>
          <defs>
            <radialGradient id={gradientId}>
              <stop offset="0%" stopColor={nebulaHue} stopOpacity={0.32} />
              <stop offset="60%" stopColor={nebulaHue} stopOpacity={0.1} />
              <stop offset="100%" stopColor={nebulaHue} stopOpacity={0} />
            </radialGradient>
          </defs>
          <ellipse
            cx={box.x + box.size / 2}
            cy={box.y + box.size / 2}
            rx={box.size * 0.62}
            ry={box.size * 0.5}
            fill={`url(#${gradientId})`}
            opacity={0.35 + 0.65 * (stars.length / points.length)}
          />
        </>
      )}

      {/* The engraved figure, under everything else in the constellation. */}
      <AtlasFigure def={def} box={box} fill={fill} complete={complete} />

      {/* Edges not yet earned: a faint blueprint of what is being built. */}
      {!complete &&
        def.shape.edges
          .filter(([a, b]) => !(filled(a) && filled(b)))
          .map(([a, b]) => (
            <line
              key={`todo-${a}-${b}`}
              x1={points[a]![0]}
              y1={points[a]![1]}
              x2={points[b]![0]}
              y2={points[b]![1]}
              stroke={LAVENDER_300}
              strokeOpacity={0.12}
              strokeWidth={1}
              strokeDasharray="2 4"
            />
          ))}

      {/* Earned edges. Glow tiers get a blurred underlay, blurred once for the whole
          figure (not once per line); the hardest tier shimmers. */}
      {style !== 'plain' && (
        <g filter={`url(#${glowId})`}>
          {earnedEdges.map(([a, b]) => (
            <line
              key={`glow-${a}-${b}`}
              x1={points[a]![0]}
              y1={points[a]![1]}
              x2={points[b]![0]}
              y2={points[b]![1]}
              stroke={LAVENDER_300}
              strokeOpacity={style === 'nebula' ? 0.55 : 0.4}
              strokeWidth={style === 'nebula' ? 4 : 3}
            />
          ))}
        </g>
      )}
      {earnedEdges.map(([a, b]) => (
        <line
          key={`edge-${a}-${b}`}
          x1={points[a]![0]}
          y1={points[a]![1]}
          x2={points[b]![0]}
          y2={points[b]![1]}
          stroke={LAVENDER_300}
          strokeOpacity={0.7}
          strokeWidth={style === 'plain' ? 1 : 1.25}
          className={full && style === 'nebula' ? 'sky-shimmer' : undefined}
        />
      ))}

      {/* Empty slots. */}
      {!complete &&
        points.map(([x, y], i) =>
          filled(i) ? null : (
            <circle key={`slot-${i}`} cx={x} cy={y} r={1.5} fill={LAVENDER_300} opacity={0.22} />
          ),
        )}

      {stars.map((session, i) => {
        const [x, y] = points[i]!;
        const look = starAppearance(session.seed, session.actualFocusS, session.starStyle);
        const form = starForm(look, session.actualFocusS, session.starStyle, starRadius, style);
        const label = starLabel(session.endedAt, session.actualFocusS);
        const ref: StarRef = { session, constellation: state, tier: style };
        const description = full ? describeStar?.(ref) : undefined;
        return (
          <g
            key={session.id}
            tabIndex={full ? 0 : undefined}
            role={full ? 'img' : undefined}
            aria-label={full ? label : undefined}
            className={full ? 'group focus:outline-none' : undefined}
            {...(full ? starHandlers(onStar, { ...ref, x, y, r: form.radius }) : {})}
          >
            {description !== undefined && <desc>{description}</desc>}
            {full && <HitArea x={x} y={y} />}
            <g
              className={full ? 'sky-twinkle' : undefined}
              style={
                full
                  ? {
                      animationDuration: `${look.twinklePeriodMs}ms`,
                      animationDelay: `-${(look.twinklePhase / (Math.PI * 2)) * look.twinklePeriodMs}ms`,
                    }
                  : undefined
              }
            >
              <AstroStar
                x={x}
                y={y}
                form={form}
                color={look.color}
                brightness={look.brightness}
                id={`${glowId}-${session.id}`}
              />
            </g>
            {/* Outside the twinkle, so the ring never fades with the star. */}
            {full && <FocusRing x={x} y={y} r={form.radius} />}
          </g>
        );
      })}
    </g>
  );
};
