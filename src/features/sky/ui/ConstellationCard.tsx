import { forwardRef, type CSSProperties } from 'react';

import type { ConstellationCardModel } from './describe';

/**
 * The card shown while a constellation is hovered or its caption focused: its
 * name in the atlas type, how far it has got, when it began and how much focus
 * it holds (View sky upgrade PR 4). Same frame as the star card.
 *
 * Purely visual and `aria-hidden`, like the star card: the same words are the
 * caption's `<desc>`.
 */
export interface ConstellationCardProps {
  model: ConstellationCardModel;
  style: CSSProperties;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}

export const ConstellationCard = forwardRef<HTMLDivElement, ConstellationCardProps>(
  ({ model, style, onPointerEnter, onPointerLeave }, ref) => (
    <div
      ref={ref}
      aria-hidden
      data-testid="constellation-card"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      style={style}
      className="rounded-soft border-night-600 bg-night-800/95 absolute z-20 flex w-max max-w-72 flex-col gap-0.5 border px-4 py-3 text-sm shadow-lg backdrop-blur"
    >
      <p className="font-atlas tracking-atlas text-lavender-200 text-base">{model.name}</p>
      <p className="text-ink-primary">{model.progress}</p>
      <p className="text-ink-secondary">{model.started}</p>
      <p className="text-ink-secondary">{model.totalFocus}</p>
    </div>
  ),
);
ConstellationCard.displayName = 'ConstellationCard';
