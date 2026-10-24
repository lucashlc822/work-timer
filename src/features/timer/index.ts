/**
 * Public entrypoint of the timer feature — the only module `app/` may import.
 */
export { TimerScreen } from './ui/TimerScreen';
export { MiniCountdown } from './ui/MiniCountdown';
export { TimerProvider } from './ui/TimerProvider';
export { useTimer } from './ui/timerContext';
export type { ResultInfo, RunningInfo, TagPickerProps, TimerSlots } from './ui/slots';
export type { TimerSession, TimerStatus } from './hooks/useTimerSession';
export type { FinishedResult } from './domain/timerMachine';
export type { ActiveSession, CancelRequest, TogetherStart } from './domain/types';
