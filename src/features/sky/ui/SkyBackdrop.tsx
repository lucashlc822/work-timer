import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';

import { db } from '@/shared/db';

import type { StarDetails } from '../data/starDetails';
import { isShared, type SharedState } from '../domain/shared';
import type { ConstellationState, SkyState } from '../domain/types';
import { useElementSize } from '../hooks/useElementSize';
import { useEquippedTheme } from '../hooks/useEquippedTheme';
import { useSky } from '../hooks/useSky';
import { useCelebrations } from '../hooks/useCelebrations';
import { useStarDetails } from '../hooks/useStarDetails';
import { AmbientCanvas } from './AmbientCanvas';
import { cardPosition, type CardAnchor, type CardInsets } from './cardPosition';
import { ConstellationCard } from './ConstellationCard';
import {
  ConstellationLayer,
  type FigureTarget,
  type SkyMode,
  type StarEvent,
  type StarRef,
  type StarTarget,
} from './ConstellationLayer';
import {
  constellationCardModel,
  constellationDescription,
  starCardModel,
  starDescription,
  type CardFacts,
} from './describe';
import { StarCard } from './StarCard';

/** How long a card stays after the pointer leaves its star, so it can be reached (WCAG 1.4.13). */
export const CARD_GRACE_MS = 250;

/** The floating "Back" button sits over the bottom of the sky; a card never covers it. */
const DEFAULT_INSETS: CardInsets = { top: 0, bottom: 88 };

/** A style key as words, until `app/` hands over the shop's names. */
const fallbackStyleName = (key: string | undefined): string =>
  key === undefined || key === '' ? 'Classic' : key[0]!.toUpperCase() + key.slice(1);

interface ActiveFigure {
  target: FigureTarget;
  via: 'pointer' | 'focus';
}

interface Active {
  target: StarTarget;
  /** How it was opened: a focused star's card closes on blur, a hovered one after a grace. */
  via: 'pointer' | 'focus';
}

/**
 * A night sky filling the window: the ambient field in `themeKey`, with the
 * given constellations over it. Pure — it draws whatever sky it is handed, so
 * it can show a friend's sky as readily as your own.
 *
 * In `hero` mode it is pure backdrop and ignores the pointer, so the timer
 * above it stays fully clickable. In `full` mode the earned stars become
 * hoverable and focusable, and hovering or focusing one shows a card about it
 * (View sky upgrade PR 3); so does a constellation, whose caption is its
 * keyboard stop, and the others dim while it is looked at (PR 4). Escape closes
 * an open card first and only then reaches whoever leaves the sky.
 */
export const SkyView = ({
  sky,
  themeKey,
  mode,
  shared,
  focusId,
  details,
  styleName = fallbackStyleName,
  insets = DEFAULT_INSETS,
  cardSide = 'above',
  celebrating,
  label,
}: {
  sky: SkyState | undefined;
  themeKey: string | undefined;
  mode: SkyMode;
  /** Shared constellations to draw alongside (M7 phase 5). */
  shared?: readonly SharedState[];
  /** In hero mode, the shared one the next session is for. */
  focusId?: string | null;
  /**
   * Your own stars' tags, Pomodoro places and companions. Absent for a
   * friend's sky, whose card then says only when, how long, and which style.
   */
  details?: ReadonlyMap<string, StarDetails>;
  /** A star style's display name ("Ember"); `app/` passes the shop's. */
  styleName?: (key: string | undefined) => string;
  /** Room to leave at the top and bottom for whatever floats over the sky. */
  insets?: CardInsets;
  /**
   * Which side of a star its card prefers. A friend's sky has a header of
   * varying height over its top, so its cards prefer to sit below the star.
   */
  cardSide?: 'above' | 'below';
  /**
   * Constellations playing their completion moment, by id, with each one's
   * start delay. Only your own sky passes this; a friend's never celebrates.
   */
  celebrating?: ReadonlyMap<string, number>;
  /** The full sky's accessible name; a friend's is theirs. Defaults to "Your sky". */
  label?: string;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const { width, height } = useElementSize(ref);
  const full = mode === 'full';

  // What is being looked at: a star (its card wins), and the constellation the
  // pointer is over or whose caption has focus (it stays bright, the rest dim).
  const [active, setActive] = useState<Active | null>(null);
  const [figure, setFigure] = useState<ActiveFigure | null>(null);
  const starTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const figureTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancelClose = useCallback(() => {
    clearTimeout(starTimer.current);
    clearTimeout(figureTimer.current);
  }, []);
  const closeStarSoon = useCallback(() => {
    clearTimeout(starTimer.current);
    starTimer.current = setTimeout(() => setActive(null), CARD_GRACE_MS);
  }, []);
  const closeFigureSoon = useCallback(() => {
    clearTimeout(figureTimer.current);
    figureTimer.current = setTimeout(() => setFigure(null), CARD_GRACE_MS);
  }, []);
  /** The pointer left a card: whatever it was about goes after the grace. */
  const closeSoon = useCallback(() => {
    closeStarSoon();
    closeFigureSoon();
  }, [closeStarSoon, closeFigureSoon]);
  const closeAll = useCallback(() => {
    cancelClose();
    setActive(null);
    setFigure(null);
  }, [cancelClose]);
  useEffect(() => cancelClose, [cancelClose]);

  const onStar = useCallback(
    (event: StarEvent, target: StarTarget) => {
      switch (event) {
        case 'enter':
          clearTimeout(starTimer.current);
          setActive({ target, via: 'pointer' });
          break;
        case 'focus':
          clearTimeout(starTimer.current);
          setActive({ target, via: 'focus' });
          break;
        case 'leave':
          closeStarSoon();
          break;
        case 'blur':
          setActive((now) =>
            now !== null && now.via === 'focus' && now.target.session.id === target.session.id
              ? null
              : now,
          );
          break;
      }
    },
    [closeStarSoon],
  );

  const onFigure = useCallback(
    (event: StarEvent, target: FigureTarget) => {
      const id = target.constellation.choice.id;
      switch (event) {
        case 'enter':
          clearTimeout(figureTimer.current);
          setFigure({ target, via: 'pointer' });
          break;
        case 'focus':
          clearTimeout(figureTimer.current);
          setFigure({ target, via: 'focus' });
          break;
        case 'leave':
          closeFigureSoon();
          break;
        case 'blur':
          setFigure((now) =>
            now !== null && now.via === 'focus' && now.target.constellation.choice.id === id
              ? null
              : now,
          );
          break;
      }
    },
    [closeFigureSoon],
  );

  // Leaving the full sky, or the window changing size, takes the cards away.
  useEffect(() => {
    closeAll();
  }, [full, width, height, closeAll]);

  // Escape closes the cards before anything else hears it: listening on the
  // window in the capture phase runs ahead of the document listener that
  // leaves the sky, and stopping it there means one press does one thing.
  const open = active !== null || figure !== null;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      closeAll();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, closeAll]);

  const factsFor = useCallback(
    (star: StarRef): CardFacts => {
      const mine = details?.get(star.session.id);
      // In a constellation you share, a star this device has no session for is your friend's.
      const partnerName =
        details !== undefined &&
        mine === undefined &&
        star.constellation !== null &&
        isShared(star.constellation)
          ? star.constellation.partnerName
          : null;
      return {
        tag: mine?.tag ?? null,
        run: mine?.run ?? null,
        together: mine?.together ?? null,
        partnerName,
      };
    },
    [details],
  );

  const modelFor = useCallback(
    (star: StarRef) =>
      starCardModel(star.session, factsFor(star), styleName(star.session.starStyle), Date.now()),
    [factsFor, styleName],
  );
  const describeStar = useCallback((star: StarRef) => starDescription(modelFor(star)), [modelFor]);
  const describeFigure = useCallback(
    (c: ConstellationState) => constellationDescription(constellationCardModel(c, Date.now())),
    [],
  );

  // The constellation set apart: the one looked at, else the one a focused or
  // hovered star belongs to.
  const activeFigureId =
    figure?.target.constellation.choice.id ?? active?.target.constellation?.choice.id ?? null;

  const view = { w: width, h: height };

  // Said once per moment, politely, so a screen reader hears what the eye sees.
  const announcement =
    full && celebrating !== undefined && sky !== undefined
      ? [...sky.constellations, ...(shared ?? [])]
          .filter((c) => celebrating.has(c.choice.id))
          .map((c) => `${constellationCardModel(c, Date.now()).name} is complete.`)
          .join(' ')
      : '';

  return (
    <div ref={ref} className={`fixed inset-0 ${full ? '' : 'pointer-events-none'}`}>
      {full && (
        <p className="sr-only" aria-live="polite" data-testid="sky-announcer">
          {announcement}
        </p>
      )}
      <AmbientCanvas themeKey={themeKey} motion={full ? 'living' : 'calm'} />
      {sky !== undefined && width > 0 && (
        <ConstellationLayer
          sky={sky}
          mode={mode}
          width={width}
          height={height}
          {...(shared !== undefined && { shared })}
          {...(focusId !== undefined && { focusId })}
          {...(full && { onStar, describeStar, onFigure, describeFigure, activeFigureId })}
          {...(full && celebrating !== undefined && { celebrating })}
          {...(label !== undefined && { label })}
        />
      )}
      {full && active !== null ? (
        <PlacedCard
          key={`star-${active.target.session.id}`}
          anchor={active.target}
          measureKey={active.target.session.id}
          view={view}
          insets={insets}
          prefer={cardSide}
          render={(cardRef, style) => (
            <StarCard
              ref={cardRef}
              model={modelFor(active.target)}
              star={active.target.session}
              tier={active.target.tier}
              style={style}
              onPointerEnter={cancelClose}
              onPointerLeave={closeSoon}
            />
          )}
        />
      ) : (
        full &&
        figure !== null && (
          <PlacedCard
            key={`figure-${figure.target.constellation.choice.id}`}
            anchor={figure.target}
            measureKey={figure.target.constellation.choice.id}
            view={view}
            insets={insets}
            prefer={cardSide}
            render={(cardRef, style) => (
              <ConstellationCard
                ref={cardRef}
                model={constellationCardModel(figure.target.constellation, Date.now())}
                style={style}
                onPointerEnter={cancelClose}
                onPointerLeave={closeSoon}
              />
            )}
          />
        )
      )}
    </div>
  );
};

/** A card, measured once drawn and then placed beside what it is about. */
const PlacedCard = ({
  anchor,
  measureKey,
  view,
  insets,
  prefer,
  render,
}: {
  anchor: CardAnchor;
  /** Re-measure when this changes. */
  measureKey: string;
  view: { w: number; h: number };
  insets: CardInsets;
  prefer: 'above' | 'below';
  render: (ref: RefObject<HTMLDivElement | null>, style: CSSProperties) => ReactNode;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    if (box !== undefined) setSize({ w: box.width, h: box.height });
  }, [measureKey]);

  const place =
    size === null
      ? null
      : cardPosition({ x: anchor.x, y: anchor.y, r: anchor.r }, size, view, insets, prefer);
  // Hidden for the one layout pass it takes to measure it.
  return render(
    ref,
    place === null
      ? { left: 0, top: 0, visibility: 'hidden' }
      : { left: place.left, top: place.top },
  );
};

/**
 * Your own sky, live from this device's store, behind everything else, with
 * your shared constellations (from the server, through `app/`) beside it.
 */
export const SkyBackdrop = ({
  mode,
  shared,
  focusId,
  styleName,
}: {
  mode: SkyMode;
  shared?: readonly SharedState[];
  focusId?: string | null;
  styleName?: (key: string | undefined) => string;
}) => {
  const full = mode === 'full';
  const sky = useSky();
  const details = useStarDetails(full);

  // Every finished constellation, your own and the shared ones, for the
  // completion moment. Undefined until the sky has been read.
  const finished = useMemo(
    () =>
      sky === undefined
        ? undefined
        : [...sky.constellations, ...(shared ?? [])].flatMap((c) =>
            c.complete && c.completedAt !== null
              ? [{ id: c.choice.id, completedAt: c.completedAt }]
              : [],
          ),
    [sky, shared],
  );
  const celebrating = useCelebrations(db, finished, full);

  return (
    <SkyView
      sky={sky}
      themeKey={useEquippedTheme()}
      mode={mode}
      celebrating={celebrating}
      {...(shared !== undefined && { shared })}
      {...(focusId !== undefined && { focusId })}
      {...(details !== undefined && { details })}
      {...(styleName !== undefined && { styleName })}
    />
  );
};
