import { useLiveQuery } from 'dexie-react-hooks';

import { db } from '@/shared/db';

import { StarGlyph } from './StarGlyph';

/**
 * The star on the result screen, in the style the session was stamped with
 * when it completed (M6) — read from the session row, so it is exactly the star
 * that appears in the sky. Until that read lands it draws the classic star,
 * which is only ever a frame or two.
 */
export const ResultStarGlyph = ({
  sessionId,
  seed,
  focusS,
}: {
  sessionId: string;
  seed: string;
  focusS: number;
}) => {
  const style = useLiveQuery(
    async () => (await db.sessions.get(sessionId))?.starStyle ?? null,
    [sessionId],
  );
  return <StarGlyph seed={seed} focusS={focusS} style={style} />;
};
