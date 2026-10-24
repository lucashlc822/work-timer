import { useEffect, useRef } from 'react';

import { friendCancel, shouldAutoStart, type Together } from '@/features/friends';
import type { TimerSession } from '@/features/timer';
import { db } from '@/shared/db';

/** Whether this device already ran (or is running) its session for a room. */
const hasSessionFor = async (roomId: string, startsAt: number): Promise<boolean> =>
  (await db.sessions
    .where('startedAt')
    .equals(startsAt)
    .filter((s) => s.togetherId === roomId)
    .count()) > 0;

/**
 * Focus together (M7 phase 4) meets the timer. Neither feature imports the
 * other; this is where they're joined, like the slots in HomeRoute.
 *
 * - When your room starts (or this device comes back while it still runs),
 *   the timer starts at the room's shared start, so every member counts down
 *   to the same end. Once per room per device: a session already recorded for
 *   it, finished or not, is never started again.
 * - When a friend ends the room early, the running session here ends at the
 *   moment they did, and the result says who.
 *
 * Your own end-early is sent to the room by `onEnded` on the timer provider.
 */
export const useTogetherTimer = (together: Together, timer: TimerSession, me: string): void => {
  const { room, rooms } = together;
  const { status, session, start, confirmCancel } = timer;
  const starting = useRef(new Set<string>());

  useEffect(() => {
    if (room === null || status !== 'idle' || room.startsAt === null) return;
    if (!shouldAutoStart(room, me, Date.now()) || starting.current.has(room.id)) return;
    const { id, startsAt, plannedDurationS } = room;
    starting.current.add(id);
    void hasSessionFor(id, startsAt).then((had) => {
      if (had) return;
      start({
        mode: 'countdown',
        plannedDurationS,
        tagId: null,
        together: { roomId: id, startsAt },
      });
    });
  }, [room, status, me, start]);

  const roomId = session?.togetherId ?? null;
  useEffect(() => {
    if (status !== 'running' || roomId === null) return;
    const ran = rooms.find((r) => r.id === roomId);
    const cancel = ran === undefined ? null : friendCancel(ran, me);
    if (cancel !== null) confirmCancel(cancel);
  }, [rooms, status, roomId, me, confirmCancel]);
};
