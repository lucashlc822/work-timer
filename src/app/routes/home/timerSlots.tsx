import { NewStarNote, ResultStar, StartHint } from '@/features/sky';
import { ProgressLine, RewardNote } from '@/features/progression';
import { TagPicker } from '@/features/tags';
import { reached, type TimerSlots } from '@/features/timer';

import { ResultRewardSummary, ResultTally, RunRewardSummary, RunTally } from '../../resultRewards';

/**
 * Sky and Stardust content for the timer's slots. The features never import
 * each other; this is the one place they meet.
 */
export const timerSlots: TimerSlots = {
  tagPicker: (props) => <TagPicker {...props} />,
  startHint: (plannedS) => <StartHint plannedS={plannedS} />,
  progressLine: () => <ProgressLine />,
  resultStar: (result, moment) => (
    <ResultStar
      sessionId={result.sessionId}
      seed={result.seed}
      focusS={result.actualFocusS}
      // When the moment reaches `arrive`, the star takes its place in the sky behind.
      {...(moment !== undefined && {
        arrival: { arrived: reached(moment.stage, 'arrive'), instant: moment.skipped },
      })}
    />
  ),
  resultNote: (result, moment) =>
    result.outcome === 'completed' ? (
      <>
        <NewStarNote sessionId={result.sessionId} />
        <ResultTally sessionId={result.sessionId} moment={moment} />
      </>
    ) : null,
  resultSummary: (result) =>
    result.outcome === 'completed' ? <ResultRewardSummary sessionId={result.sessionId} /> : null,
  // Between Pomodoro blocks: where the star went and what the block earned. The
  // whole run's tally waits for its summary.
  blockNote: (result) =>
    result.outcome === 'completed' ? (
      <>
        <NewStarNote sessionId={result.sessionId} />
        <RewardNote outcome={result.outcome} actualFocusS={result.actualFocusS} />
      </>
    ) : null,
  runNote: (run, moment) => <RunTally sessionIds={run.sessionIds} moment={moment} />,
  runSummary: (run) => <RunRewardSummary sessionIds={run.sessionIds} />,
};
