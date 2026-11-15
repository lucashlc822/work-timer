import { useMemo } from 'react';

import { RewardSummary, RewardTally, type FinishedConstellation } from '@/features/progression';
import { useStarPlacement } from '@/features/sky';
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
