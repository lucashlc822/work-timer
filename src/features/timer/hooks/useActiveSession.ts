import { useLiveQuery } from 'dexie-react-hooks';

import { db } from '@/shared/db';

import { peekActiveSession } from '../data/sessionRepository';
import type { ActiveSession } from '../domain/types';

/**
 * The in-flight session, kept live across windows.
 *
 * Dexie's `liveQuery` re-runs when the underlying tables change — including
 * changes made by another window on the same origin — which is how the mini
 * window follows the main one without any messaging of its own.
 *
 * Read-only by construction (`peekActiveSession` writes nothing), so a window
 * using only this hook can never disturb a session.
 *
 * @returns `undefined` while the first read is in flight, `null` when idle.
 */
export const useActiveSession = (): ActiveSession | null | undefined =>
  useLiveQuery(async () => (await peekActiveSession(db)) ?? null, []);
