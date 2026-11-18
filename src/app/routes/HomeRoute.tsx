import { useCallback } from 'react';

import { useTogether } from '@/features/friends';
import { TimerProvider, type FinishedResult } from '@/features/timer';

import { useAccount } from '../accountContext';

import { HomeScreen } from './home/HomeScreen';

/**
 * The main window: home and the timer page in front of your night sky
 * (`home/HomeScreen.tsx`; the rules for which page shows are in
 * `../navigation.ts`). The timer provider sits above both pages, so a session
 * keeps running whichever is showing.
 */
export const HomeRoute = () => {
  const { account } = useAccount();
  const together = useTogether(account.userId);
  const { cancel } = together;

  // Your own end-early in a focus-together session ends it for everyone (M7).
  const onEnded = useCallback(
    (result: FinishedResult) => {
      const roomId = result.session.togetherId;
      if (roomId !== null && result.ending.outcome === 'cancelled' && result.endedBy === null) {
        cancel(roomId);
      }
    },
    [cancel],
  );

  return (
    // The timer lives above the screen so the app can drive it too (M7).
    <TimerProvider onEnded={onEnded}>
      <HomeScreen together={together} />
    </TimerProvider>
  );
};
