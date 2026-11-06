import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';

import {
  LAVENDER_300,
  LAVENDER_400,
  MINT_300,
  NIGHT_900,
  ROSE_300,
} from '../../../../design-tokens.mjs';
import { hashSeed } from '@/shared/lib';

import {
  CAPTION_ALPHA,
  CAPTION_ALPHA_ACTIVE,
  CAPTION_LINE_HEIGHT,
  captionCandidates,
  shrunkFontSize,
} from '../domain/captionLayout';
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
  /**
   * Full mode only: constellations playing their completion moment now, by id,
   * with the delay (ms) before each starts (View sky upgrade PR 6).
   */
  celebrating?: ReadonlyMap<string, number>;
  /**
   * Full mode only: pixels covered from the top of the window by something
   * laid over the sky (a friend's header). Figures and wandering stars are laid
   * out below it; unset, the whole window is used as before.
   */
  reserveTop?: number;
  /** Full mode only: the sky's accessible name. Your own is "Your sky"; a friend's is theirs. */
  label?: string;
}

/** Air left between a header over the sky and the first figure. */
const CLEAR_OF_COVER = 16;

/** Between one line drawing itself in and the next, in growth order. */
export const EDGE_STAGGER_MS = 180;

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
  celebrating,
  reserveTop,
  label = 'Your sky',
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
  // Below whatever covers the top (plus a little air), and never more than 60% of the window.
  const clear =
    full && reserveTop !== undefined && reserveTop > 0
      ? Math.min(reserveTop + CLEAR_OF_COVER, height * 0.6)
      : undefined;
  const wanderArea = clear === undefined ? undefined : { top: clear, bottom: height * 0.14 };
  const shown: { state: ConstellationState; box: Placement }[] = full
    ? gridPlacements(
        visible.length,
        width,
        height,
        clear === undefined
          ? undefined
          : { top: Math.max(height * 0.1, clear), bottom: height * 0.14 },
      ).map((box, i) => ({ state: visible[i]!, box }))
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
      aria-label={full ? label : undefined}
      data-active={full && activeFigureId !== null ? activeFigureId : undefined}
      onKeyDown={full ? moveAlongUnit : undefined}
    >
      <defs>
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
      </defs>

      {sky.wandering.map(({ session }, i) => {
        const [x, y] = wanderingPosition(session.seed, width, height, wanderArea);
        const look = starAppearance(session.seed, session.actualFocusS, session.starStyle);
        // Smaller than a star in a constellation, with shorter spikes: it belongs to nothing.
        const form = starForm(look, session.actualFocusS, session.starStyle, 1.3, 'plain', {
          spikeScale: 0.6,
        });
        const label = wanderingStarLabel(session.endedAt, session.actualFocusS);
        const ref: StarRef = { session, constellation: null, tier: 'plain' };
        const description = full
          ? withHint(
              describeStar?.(ref),
              i === 0 && sky.wandering.length > 1 ? WANDERING_HINT : null,
            )
          : undefined;
        return (
          <g
            key={session.id}
            // The wandering stars are one Tab stop, the first of them; arrows move between them.
            tabIndex={full ? (i === 0 ? 0 : -1) : undefined}
            data-nav-unit={full ? WANDERING_UNIT : undefined}
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
          celebrate={full ? celebrating?.get(state.choice.id) : undefined}
        />
      ))}
    </svg>
  );
};

/** The arrow-key unit of the stars that belong to no constellation. */
const WANDERING_UNIT = 'wandering';

/** Told to a screen reader on a figure's Tab stop, so the arrow keys can be found. */
export const STARS_HINT = 'Use the arrow keys to move between its stars.';
export const WANDERING_HINT = 'Use the arrow keys to move between the wandering stars.';

const withHint = (description: string | undefined, hint: string | null): string | undefined =>
  hint === null ? description : description === undefined ? hint : `${description} ${hint}`;

/**
 * The sky's keyboard model (a roving Tab stop). Each constellation is one Tab
 * stop: its caption, or its first star when the caption isn't focusable; the
 * wandering stars are one more, the first of them. Inside a unit the arrow
 * keys move one star at a time (Right/Down onward, Left/Up back, from the
 * first star back to the caption), Home and End to its ends; they don't wrap.
 * So a crowded sky is a few stops, not one per star, and every star is still
 * reachable. Focus moving fires the usual focus/blur, so cards follow it.
 */
const moveAlongUnit = (e: KeyboardEvent<SVGSVGElement>): void => {
  const step: Partial<Record<string, 'next' | 'prev' | 'first' | 'last'>> = {
    ArrowRight: 'next',
    ArrowDown: 'next',
    ArrowLeft: 'prev',
    ArrowUp: 'prev',
    Home: 'first',
    End: 'last',
  };
  const move = step[e.key];
  if (move === undefined || e.altKey || e.ctrlKey || e.metaKey) return;
  const from = (e.target as Element).closest('[data-nav-unit]');
  if (from === null) return;
  const unit = from.getAttribute('data-nav-unit');
  // In page order, which puts a caption before its stars.
  const items = Array.from(e.currentTarget.querySelectorAll<SVGElement>('[data-nav-unit]')).filter(
    (el) => el.getAttribute('data-nav-unit') === unit,
  );
  const at = items.indexOf(from as SVGElement);
  const to =
    move === 'next'
      ? Math.min(at + 1, items.length - 1)
      : move === 'prev'
        ? Math.max(at - 1, 0)
        : move === 'first'
          ? 0
          : items.length - 1;
  // Arrows inside the sky never scroll the page, even at a unit's end.
  e.preventDefault();
  if (to !== at) items[to]!.focus();
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
 * tracking run wider than the figure's own cell, so what was drawn is measured
 * and, while it is wider than the cell, set on more lines (`captionCandidates`,
 * fewest first), and only as a last resort smaller. Then it is nudged back
 * inside the window's edges: the last column's caption (a shared
 * constellation's "The Kite · with Bea · 1/4" is the longest) would be clipped by
 * the window at narrow widths. All of it is re-measured when the web font
 * arrives, since the fallback face has different widths. This happens before
 * the browser paints, so no one sees the steps.
 *
 * A caption keeps its own opacity, never its figure's: an unfinished or dimmed
 * figure fades its lines and stars, but its name stays readable (4.5:1).
 */
const Caption = ({
  text,
  cx,
  y,
  fontSize,
  nebula,
  viewWidth,
  maxWidth,
  active,
  focus,
}: {
  text: string;
  cx: number;
  y: number;
  fontSize: number;
  nebula: boolean;
  viewWidth: number;
  /** The width of the figure's cell: a caption wider than this wraps. */
  maxWidth: number;
  /** The figure being looked at, whose caption is a little brighter. */
  active: boolean;
  /** Makes the caption the constellation's keyboard stop (View sky upgrade PR 4). */
  focus?: {
    label: string;
    description: string | undefined;
    /** The figure's id: the caption and its stars are one unit for the arrow keys. */
    navUnit: string;
    onFocus: () => void;
    onBlur: () => void;
  };
}) => {
  const ref = useRef<SVGTextElement>(null);
  const [dx, setDx] = useState(0);
  // Until measured (and always in jsdom), a fair guess at small capitals' width.
  const [width, setWidth] = useState(text.length * fontSize * 0.62);
  const [fontEpoch, setFontEpoch] = useState(0);
  // Which setting of the words is drawn: reset whenever anything it depends on changes.
  const fitKey = `${text}|${maxWidth}|${fontSize}|${nebula}|${fontEpoch}`;
  const [fit, setFit] = useState({ key: fitKey, index: 0, size: fontSize });
  const now = fit.key === fitKey ? fit : { key: fitKey, index: 0, size: fontSize };

  useEffect(() => {
    const fonts = typeof document === 'undefined' ? undefined : document.fonts;
    if (fonts === undefined) return;
    const bump = () => setFontEpoch((n) => n + 1);
    fonts.addEventListener('loadingdone', bump);
    return () => fonts.removeEventListener('loadingdone', bump);
  }, []);

  const candidates = captionCandidates(text);
  const lines = candidates[Math.min(now.index, candidates.length - 1)]!;
  const extraLines = lines.length - 1;
  const lineHeight = now.size * CAPTION_LINE_HEIGHT;
  const linesKey = lines.join('\n');

  useLayoutEffect(() => {
    const el = ref.current;
    // jsdom has no text metrics: leave the caption on one line, centred.
    if (el === null || typeof el.getBBox !== 'function') return;
    const measured = el.getBBox().width;
    setWidth(measured);
    if (measured > maxWidth + 0.5) {
      // Too wide for its cell: more lines first, then smaller.
      if (now.index < candidates.length - 1) {
        setFit({ key: fitKey, index: now.index + 1, size: fontSize });
        return;
      }
      const smaller = shrunkFontSize(now.size, measured, maxWidth);
      if (smaller < now.size - 0.05) {
        setFit({ key: fitKey, index: now.index, size: smaller });
        return;
      }
    }
    const half = measured / 2;
    const lowest = CAPTION_EDGE + half;
    const highest = viewWidth - CAPTION_EDGE - half;
    // A caption wider than the window itself stays centred rather than flip-flopping.
    const x = highest < lowest ? cx : Math.min(Math.max(cx, lowest), highest);
    setDx(x - cx);
    // `candidates` is a function of `text`, already in the key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, now.index, now.size, linesKey, cx, viewWidth, maxWidth, fontSize]);

  const words = (
    <text
      ref={ref}
      x={cx + dx}
      y={y}
      textAnchor="middle"
      fill={LAVENDER_300}
      fillOpacity={active ? CAPTION_ALPHA_ACTIVE : CAPTION_ALPHA}
      // A dark edge under the letters, so they hold against a figure's own glow.
      stroke={NIGHT_900}
      strokeOpacity={0.7}
      strokeWidth={3}
      strokeLinejoin="round"
      paintOrder="stroke"
      fontSize={now.size}
      className="font-atlas"
      fontWeight={500}
      fontStyle={nebula ? 'italic' : undefined}
      style={{
        letterSpacing: nebula ? 'calc(var(--tracking-atlas) * 2)' : 'var(--tracking-atlas)',
        fontVariantNumeric: 'oldstyle-nums',
      }}
    >
      {lines.length === 1
        ? lines[0]
        : lines.map((line, i) => (
            <tspan key={line} x={cx + dx} dy={i === 0 ? 0 : lineHeight}>
              {line}
            </tspan>
          ))}
    </text>
  );
  if (focus === undefined) return words;

  // A target at least 24 px tall (WCAG 2.5.8) around the words, and a ring on it
  // for the keyboard (2.4.7): the global outline would box the SVG oddly.
  const height = Math.max(24, now.size + 12 + extraLines * lineHeight);
  const box = {
    x: cx + dx - width / 2 - 6,
    y: y - now.size - (height - now.size - extraLines * lineHeight) / 2 + 3,
    width: width + 12,
    height,
  };
  return (
    <g
      tabIndex={0}
      data-nav-unit={focus.navUnit}
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
  celebrate,
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
  /** When set, its completion moment plays, starting after this many ms. */
  celebrate: number | undefined;
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
  // How long the lines take to draw in, one after another: the figure follows.
  const linesMs = def.shape.edges.length * EDGE_STAGGER_MS;
  const figure: FigureTarget = {
    constellation: state,
    x: box.x + box.size / 2,
    y: box.y + box.size / 2,
    r: box.size / 2,
  };
  // Faded (abandoned, or a stopped shared one) unless it is the one looked at.
  const base = faded && !active ? 0.45 : 1;
  // The cell the figure sits in (`gridPlacements` makes the box 70% of it): its caption wraps to fit.
  const cellWidth = box.size / 0.7;

  return (
    <g
      data-figure={full ? state.choice.id : undefined}
      role={full ? 'group' : undefined}
      aria-label={full ? progressLabel(state) : undefined}
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
          maxWidth={cellWidth - 6}
          active={active}
          {...(onFigure !== undefined && {
            focus: {
              label: progressLabel(state),
              description: withHint(describeFigure?.(state), stars.length > 0 ? STARS_HINT : null),
              navUnit: state.choice.id,
              onFocus: () => onFigure('focus', figure),
              onBlur: () => onFigure('blur', figure),
            },
          })}
        />
      )}

      {/* Everything but the caption fades (unfinished) and dims (another figure looked at). */}
      <g
        data-figure-body={full ? state.choice.id : undefined}
        style={full ? { opacity: base * (dimmed ? DIMMED : 1) } : { opacity: base }}
        className={full ? 'ease-gentle transition-opacity duration-500' : undefined}
      >
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
        {/* The completion moment's bloom: a soft swell of light behind the figure. */}
        {celebrate !== undefined && (
          <>
            <defs>
              <radialGradient id={`${gradientId}-bloom`}>
                <stop
                  offset="0%"
                  stopColor={style === 'nebula' ? nebulaHue : LAVENDER_300}
                  stopOpacity={0.5}
                />
                <stop
                  offset="100%"
                  stopColor={style === 'nebula' ? nebulaHue : LAVENDER_300}
                  stopOpacity={0}
                />
              </radialGradient>
            </defs>
            <ellipse
              data-celebration="bloom"
              cx={box.x + box.size / 2}
              cy={box.y + box.size / 2}
              rx={box.size * 0.7}
              ry={box.size * 0.6}
              fill={`url(#${gradientId}-bloom)`}
              className="sky-bloom"
              style={{ animationDelay: `${celebrate}ms` }}
            />
          </>
        )}

        <AtlasFigure
          def={def}
          box={box}
          fill={fill}
          complete={complete}
          // The engraving traces itself once the lines are in.
          {...(celebrate !== undefined && { drawDelayMs: celebrate + linesMs })}
        />

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
        {earnedEdges.map(([a, b], i) => (
          <line
            key={`edge-${a}-${b}`}
            x1={points[a]![0]}
            y1={points[a]![1]}
            x2={points[b]![0]}
            y2={points[b]![1]}
            stroke={LAVENDER_300}
            strokeOpacity={0.7}
            strokeWidth={style === 'plain' ? 1 : 1.25}
            // Each line draws itself in, one after another, in the order they grew.
            {...(celebrate !== undefined
              ? {
                  pathLength: 1,
                  className: 'sky-draw',
                  style: { animationDelay: `${celebrate + i * EDGE_STAGGER_MS}ms` },
                }
              : { className: full && style === 'nebula' ? 'sky-shimmer' : undefined })}
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
              // One Tab stop per figure: its caption when that is focusable, else its first star.
              tabIndex={full ? (onFigure === undefined && i === 0 ? 0 : -1) : undefined}
              data-nav-unit={full ? state.choice.id : undefined}
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
                {/* The stars flare once as the last line lands. */}
                <g
                  {...(celebrate !== undefined && {
                    className: 'sky-flare',
                    style: { animationDelay: `${celebrate + linesMs}ms` },
                  })}
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
              </g>
              {/* Outside the twinkle, so the ring never fades with the star. */}
              {full && <FocusRing x={x} y={y} r={form.radius} />}
            </g>
          );
        })}
      </g>
    </g>
  );
};
