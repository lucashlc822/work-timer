import { useLiveQuery } from 'dexie-react-hooks';

import { db } from '@/shared/db';

import { peekActiveRun } from '../data/runRepository';
import type { PomodoroRun } from '../domain/types';

/**
 * The Pomodoro run in flight, kept live across windows — the break-time
 * counterpart of `useActiveSession`, and read-only for the same reason.
 *
 * @returns `undefined` while the first read is in flight, `null` when none.
 */
export const useActiveRun = (): PomodoroRun | null | undefined =>
  useLiveQuery(async () => (await peekActiveRun(db)) ?? null, []);
