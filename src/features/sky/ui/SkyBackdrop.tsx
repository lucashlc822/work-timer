import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { StarDetails } from '../data/starDetails';
import { isShared, type SharedState } from '../domain/shared';
import type { SkyState } from '../domain/types';
import { useElementSize } from '../hooks/useElementSize';
import { useEquippedTheme } from '../hooks/useEquippedTheme';
import { useSky } from '../hooks/useSky';
import { useStarDetails } from '../hooks/useStarDetails';
import { AmbientCanvas } from './AmbientCanvas';
import { cardPosition, type CardInsets } from './cardPosition';
import {
  ConstellationLayer,
  type SkyMode,
  type StarEvent,
  type StarRef,
  type StarTarget,
} from './ConstellationLayer';
import { starCardModel, starDescription, type CardFacts } from './describe';
import { StarCard } from './StarCard';

/** How long a card stays after the pointer leaves its star, so it can be reached (WCAG 1.4.13). */
export const CARD_GRACE_MS = 250;

/** The floating "Back" button sits over the bottom of the sky; a card never covers it. */
const DEFAULT_INSETS: CardInsets = { top: 0, bottom: 88 };

/** A style key as words, until `app/` hands over the shop's names. */
const fallbackStyleName = (key: string | undefined): string =>
  key === undefined || key === '' ? 'Classic' : key[0]!.toUpperCase() + key.slice(1);

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
 * (View sky upgrade PR 3). Escape closes an open card first and only then
 * reaches whoever leaves the sky.
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
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const { width, height } = useElementSize(ref);
  const full = mode === 'full';

  const [active, setActive] = useState<Active | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancelClose = useCallback(() => clearTimeout(closeTimer.current), []);
  const closeSoon = useCallback(() => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setActive(null), CARD_GRACE_MS);
  }, []);
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const onStar = useCallback(
    (event: StarEvent, target: StarTarget) => {
      switch (event) {
        case 'enter':
          cancelClose();
          setActive({ target, via: 'pointer' });
          break;
        case 'focus':
          cancelClose();
          setActive({ target, via: 'focus' });
          break;
        case 'leave':
          closeSoon();
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
    [cancelClose, closeSoon],
  );

  // Leaving the full sky, or the window changing size, takes the card away.
  useEffect(() => {
    cancelClose();
    setActive(null);
  }, [full, width, height, cancelClose]);

  // Escape closes the card before anything else hears it: listening on the
  // window in the capture phase runs ahead of the document listener that
  // leaves the sky, and stopping it there means one press does one thing.
  const open = active !== null;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      cancelClose();
      setActive(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, cancelClose]);

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

  return (
    <div ref={ref} className={`fixed inset-0 ${full ? '' : 'pointer-events-none'}`}>
      <AmbientCanvas themeKey={themeKey} />
      {sky !== undefined && width > 0 && (
        <ConstellationLayer
          sky={sky}
          mode={mode}
          width={width}
          height={height}
          {...(shared !== undefined && { shared })}
          {...(focusId !== undefined && { focusId })}
          {...(full && { onStar, describeStar })}
        />
      )}
      {full && active !== null && (
        <PlacedCard
          key={active.target.session.id}
          target={active.target}
          model={modelFor(active.target)}
          view={{ w: width, h: height }}
          insets={insets}
          prefer={cardSide}
          onPointerEnter={cancelClose}
          onPointerLeave={closeSoon}
        />
      )}
    </div>
  );
};

/** The card, measured once drawn and then placed beside its star. */
const PlacedCard = ({
  target,
  model,
  view,
  insets,
  prefer,
  onPointerEnter,
  onPointerLeave,
}: {
  target: StarTarget;
  model: ReturnType<typeof starCardModel>;
  view: { w: number; h: number };
  insets: CardInsets;
  prefer: 'above' | 'below';
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    if (box !== undefined) setSize({ w: box.width, h: box.height });
  }, [model]);

  const place =
    size === null
      ? null
      : cardPosition({ x: target.x, y: target.y, r: target.r }, size, view, insets, prefer);
  return (
    <StarCard
      ref={ref}
      model={model}
      star={target.session}
      tier={target.tier}
      // Hidden for the one layout pass it takes to measure it.
      style={
        place === null
          ? { left: 0, top: 0, visibility: 'hidden' }
          : { left: place.left, top: place.top }
      }
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    />
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
  const details = useStarDetails(mode === 'full');
  return (
    <SkyView
      sky={useSky()}
      themeKey={useEquippedTheme()}
      mode={mode}
      {...(shared !== undefined && { shared })}
      {...(focusId !== undefined && { focusId })}
      {...(details !== undefined && { details })}
      {...(styleName !== undefined && { styleName })}
    />
  );
};
