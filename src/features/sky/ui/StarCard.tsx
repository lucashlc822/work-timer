import { forwardRef, type CSSProperties } from 'react';

import { tagColorVar } from '@/shared/ui';

import { starAppearance } from '../domain/starAppearance';
import { starForm, type TierStyle } from '../domain/starForm';
import type { CompletedSession } from '../domain/types';
import { AstroStar } from './AstroStar';
import type { StarCardModel } from './describe';

/** The preview's box, and the radius a default star gets inside it. */
const PREVIEW = 64;
const PREVIEW_BASE_R = 6;

/**
 * The card shown beside a star while it is hovered or focused: when it was
 * earned, for how long, its tag, its context (a Pomodoro block, who you focused
 * with, or whose star it is), and the star itself, larger, in its own style.
 *
 * Purely visual and `aria-hidden`: the same words are the star's `<desc>`, so
 * a screen reader hears them on focus without depending on this card being
 * mounted in time. It has nothing focusable inside.
 */
export interface StarCardProps {
  model: StarCardModel;
  star: Pick<CompletedSession, 'id' | 'seed' | 'actualFocusS' | 'starStyle'>;
  tier: TierStyle;
  style: CSSProperties;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}

export const StarCard = forwardRef<HTMLDivElement, StarCardProps>(
  ({ model, star, tier, style, onPointerEnter, onPointerLeave }, ref) => {
    const look = starAppearance(star.seed, star.actualFocusS, star.starStyle);
    const form = starForm(look, star.actualFocusS, star.starStyle, PREVIEW_BASE_R, tier);
    return (
      <div
        ref={ref}
        aria-hidden
        data-testid="star-card"
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        style={style}
        className="rounded-soft border-night-600 bg-night-800/95 absolute z-20 flex w-max max-w-72 items-center gap-3 border p-3 shadow-lg backdrop-blur"
      >
        <svg
          width={PREVIEW}
          height={PREVIEW}
          viewBox={`0 0 ${PREVIEW} ${PREVIEW}`}
          className="shrink-0 overflow-visible"
        >
          <g className="sky-twinkle" style={{ animationDuration: `${look.twinklePeriodMs}ms` }}>
            <AstroStar
              x={PREVIEW / 2}
              y={PREVIEW / 2}
              form={form}
              color={look.color}
              brightness={look.brightness}
              id={`card-${star.id}`}
            />
          </g>
        </svg>
        <div className="flex min-w-0 flex-col gap-0.5 text-sm">
          <p className="text-ink-primary font-medium">{model.date}</p>
          <p className="text-ink-secondary">
            {/* The only break is the space before the dot, so the dot leads the second line. */}
            <span className="whitespace-nowrap">{model.time}</span>{' '}
            <span className="whitespace-nowrap">· {model.duration}</span>
          </p>
          {model.tag !== null && (
            <p className="text-ink-secondary flex items-center gap-1.5">
              <span
                className="inline-block size-2 shrink-0 rounded-full"
                style={{ backgroundColor: tagColorVar(model.tag.color) }}
              />
              <span className="truncate">{model.tag.name}</span>
            </p>
          )}
          {model.context.map((line) => (
            <p key={line} className="text-ink-secondary">
              {line}
            </p>
          ))}
          <p className="text-ink-muted text-xs">{model.styleName} star</p>
        </div>
      </div>
    );
  },
);
StarCard.displayName = 'StarCard';
