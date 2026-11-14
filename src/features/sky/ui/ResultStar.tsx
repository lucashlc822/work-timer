import { useLiveQuery } from 'dexie-react-hooks';
import { useId } from 'react';

import { db } from '@/shared/db';

import { starAppearance } from '../domain/starAppearance';
import { starForm } from '../domain/starForm';
import { AstroStar } from './AstroStar';

/**
 * The drawing's own box and a star's radius inside it; scaled up, not redrawn.
 * The box is tight on purpose: the star's body fills about a third of it and
 * its corona and spikes run to (and past) the edges, so at 80 px it reads as
 * the moment's centrepiece. `overflow-visible` lets the corona spill.
 */
export const RESULT_STAR_BOX = 20;
export const RESULT_STAR_R = 4.6;
/** The tier the result star is drawn at: a medium constellation's reach, as in the shop. */
export const RESULT_STAR_TIER = 'glow';

/**
 * The star a finished session just became, drawn the way the sky draws it
 * (session-complete redesign, PR 1; replaces `StarGlyph` there).
 *
 * The same `starAppearance` -> `starForm` -> `AstroStar` path as a star in the
 * sky and the shop's `StylePreview`, from the session's own seed, length and
 * stamped style, so the star on the result is the one that lands in the sky:
 * its colour, its spikes, its corona. The style is read from the session row
 * (stamped by `finishSession` in the same transaction); until that read lands,
 * a frame or two, it draws as `classic`.
 *
 * Draws only. The ignite is the timer's wrapper's animation, so it stays one
 * place that skipping and reduced motion control. Decorative: the result's
 * heading says what happened. No `filter`, like every star.
 */
export const ResultStar = ({
  sessionId,
  seed,
  focusS,
  size = '100%',
}: {
  sessionId: string;
  seed: string;
  focusS: number;
  /** Px, or a CSS length; by default it fills the box the timer gives it. */
  size?: number | string;
}) => {
  const id = `result-${useId()}`;
  const style = useLiveQuery(
    async () => (await db.sessions.get(sessionId))?.starStyle ?? null,
    [sessionId],
  );
  const look = starAppearance(seed, focusS, style);
  const form = starForm(look, focusS, style, RESULT_STAR_R, RESULT_STAR_TIER);
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${RESULT_STAR_BOX} ${RESULT_STAR_BOX}`}
      aria-hidden="true"
      focusable="false"
      className="overflow-visible"
      data-style={style ?? 'classic'}
      data-testid="result-star"
    >
      <AstroStar
        x={RESULT_STAR_BOX / 2}
        y={RESULT_STAR_BOX / 2}
        form={form}
        color={look.color}
        brightness={look.brightness}
        id={id}
      />
    </svg>
  );
};
