import { resolveDef } from './derive';
import type { CompletedSession, ConstellationChoice, ConstellationState } from './types';

/**
 * A shared constellation (M7 phase 5): two friends build one figure, and a
 * session counts toward it only when it was run for it.
 *
 * The fill rule is `deriveSky`'s, with the window set by the friendship
 * rather than by the next choice: sessions in `endedAt` order (ties by id),
 * from either member, each long enough for it, ending at or after
 * `acceptedAt` and before `stoppedAt`, until the figure is full.
 *
 * `starsNeeded` and `minFocusS` are the values stored with it on the server,
 * which judges "finished" by them too, so every device and the server agree on
 * when it is complete. The star count is capped at the shape's points.
 */

export interface SharedInput {
  id: string;
  partnerName: string;
  choice: ConstellationChoice;
  starsNeeded: number;
  minFocusS: number;
  /** Null while it is only a proposal. */
  acceptedAt: number | null;
  /** Set once either member stopped it or they stopped being friends. */
  stoppedAt: number | null;
  /** Both members' sessions run for it; the same id twice counts once. */
  sessions: readonly CompletedSession[];
}

export type SharedStatus = 'proposed' | 'active' | 'complete' | 'stopped';

export interface SharedState extends ConstellationState {
  partnerName: string;
  status: SharedStatus;
}

const byEndedAt = (a: CompletedSession, b: CompletedSession): number =>
  a.endedAt - b.endedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export const deriveShared = (input: SharedInput): SharedState => {
  const def = resolveDef(input.choice);
  const needed = Math.min(input.starsNeeded, def.shape.points.length);
  const stars: CompletedSession[] = [];
  let completedAt: number | null = null;

  const { acceptedAt, stoppedAt } = input;
  if (acceptedAt !== null) {
    const seen = new Set<string>();
    const unique = input.sessions.filter((s) => !seen.has(s.id) && seen.add(s.id));
    for (const session of unique.sort(byEndedAt)) {
      if (stars.length >= needed) break;
      if (session.endedAt < acceptedAt) continue;
      if (stoppedAt !== null && session.endedAt >= stoppedAt) continue;
      if (session.actualFocusS < input.minFocusS) continue;
      stars.push(session);
      if (stars.length === needed) completedAt = session.endedAt;
    }
  }

  const complete = completedAt !== null;
  const status: SharedStatus =
    acceptedAt === null
      ? 'proposed'
      : complete
        ? 'complete'
        : stoppedAt !== null
          ? 'stopped'
          : 'active';

  return {
    choice: input.choice,
    def,
    stars,
    complete,
    completedAt,
    abandoned: false,
    partnerName: input.partnerName,
    status,
  };
};
