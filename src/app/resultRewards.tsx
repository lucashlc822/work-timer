import { useMemo } from 'react';

import { RewardSummary, RewardTally, type FinishedConstellation } from '@/features/progression';
import { useStarPlacement, useStarPlacements } from '@/features/sky';
import { reached, type MomentInfo } from '@/features/timer';

import { useAccount } from './accountContext';

/**
 * Where the sky and progression meet on a finished session's result
 * (session-complete redesign, PR 2): the sky says whether this star finished a
 * constellation, and progression puts that bonus in the tally with the rest.
 */
const useFinished = (sessionId: string): readonly FinishedConstellation[] => {
  const placement = useStarPlacement(sessionId);
  const completes = placement?.kind === 'constellation' ? placement.completes : null;
  return useMemo(() => (completes === null ? [] : [completes]), [completes]);
};

/** The constellations a run's blocks finished: usually none, at most a few. */
const useFinishedBy = (sessionIds: readonly string[]): readonly FinishedConstellation[] => {
  const placements = useStarPlacements(sessionIds);
  return useMemo(
    () =>
      (placements ?? []).flatMap((p) =>
        p.kind === 'constellation' && p.completes !== null ? [p.completes] : [],
      ),
    [placements],
  );
};

/** What a whole Pomodoro run earned, under its summary; comes in with the moment's tally. */
export const RunTally = ({
  sessionIds,
  moment,
}: {
  sessionIds: readonly string[];
  moment: MomentInfo;
}) => {
  const { account } = useAccount();
  const finished = useFinishedBy(sessionIds);
  return (
    <RewardTally
      userId={account.userId}
      sessionIds={sessionIds}
      finished={finished}
      reveal={reached(moment.stage, 'tally')}
      instant={moment.skipped}
    />
  );
};

/** The run's tally as one sentence, inside the summary's status region. */
export const RunRewardSummary = ({ sessionIds }: { sessionIds: readonly string[] }) => {
  const { account } = useAccount();
  const finished = useFinishedBy(sessionIds);
  return <RewardSummary userId={account.userId} sessionIds={sessionIds} finished={finished} />;
};

/** The tally under a completed result; it comes in when the moment reaches its tally. */
export const ResultTally = ({ sessionId, moment }: { sessionId: string; moment: MomentInfo }) => {
  const { account } = useAccount();
  const finished = useFinished(sessionId);
  return (
    <RewardTally
      userId={account.userId}
      sessionIds={[sessionId]}
      finished={finished}
      reveal={reached(moment.stage, 'tally')}
      instant={moment.skipped}
    />
  );
};

/** The same facts as one sentence, inside the result's status region. */
export const ResultRewardSummary = ({ sessionId }: { sessionId: string }) => {
  const { account } = useAccount();
  const finished = useFinished(sessionId);
  return <RewardSummary userId={account.userId} sessionIds={[sessionId]} finished={finished} />;
};
