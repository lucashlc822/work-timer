import { useState } from 'react';

import { FriendsFailure } from '../data/friendsRepository';
import { FRIENDS_MESSAGES } from '../domain/errors';
import { companions, listNames, nameOf, type Room } from '../domain/room';

/**
 * The small pieces of focus together (M7 phase 4) that `app/` places in the
 * timer: the invitation banner, the line under a running clock, the warning
 * in the end-early dialog, and the line on the result.
 */

/** "Ada invites you to focus 25 min together · Join / No thanks". */
export const InviteBanner = ({
  invite,
  busy,
  onAnswer,
}: {
  invite: Room;
  /** A session is running here: joining waits until it's done. */
  busy: boolean;
  onAnswer: (roomId: string, join: boolean) => Promise<void>;
}) => {
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const answer = async (join: boolean) => {
    setActing(true);
    setError(null);
    try {
      await onAnswer(invite.id, join);
    } catch (e) {
      setError(FRIENDS_MESSAGES[e instanceof FriendsFailure ? e.kind : 'unknown']);
    } finally {
      setActing(false);
    }
  };

  return (
    <section
      aria-label="Invitation"
      className="bg-night-800/80 border-lavender-400/60 rounded-soft flex w-full max-w-md flex-col items-center gap-2 border px-4 py-3 text-center text-sm"
    >
      <p className="text-ink-primary">
        {nameOf(invite, invite.host)} invites you to focus{' '}
        {Math.round(invite.plannedDurationS / 60)} min together.
      </p>
      <p className="text-ink-secondary text-xs">If anyone ends early, it ends for everyone.</p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={acting || busy}
          onClick={() => void answer(true)}
          className="rounded-pill bg-lavender-400 text-night-900 hover:bg-lavender-300 px-4 py-1.5 text-xs transition-colors disabled:pointer-events-none disabled:opacity-50"
        >
          Join
        </button>
        <button
          type="button"
          disabled={acting}
          onClick={() => void answer(false)}
          className="rounded-pill border-night-600 text-ink-secondary hover:border-lavender-400 hover:text-ink-primary border px-4 py-1.5 text-xs transition-colors disabled:pointer-events-none disabled:opacity-50"
        >
          No thanks
        </button>
      </div>
      {busy && (
        <p className="text-ink-secondary text-xs">
          Finish the session that&rsquo;s running to join.
        </p>
      )}
      {error !== null && (
        <p role="alert" className="text-faded text-xs">
          {error}
        </p>
      )}
    </section>
  );
};

/** Under the running clock. */
export const TogetherLine = ({ room, me }: { room: Room; me: string }) => {
  const names = companions(room, me);
  return names.length === 0 ? null : (
    <p className="text-lavender-200 text-xs">Focusing together with {listNames(names)}</p>
  );
};

/** In the end-early dialog. */
export const TogetherCancelNote = ({ room, me }: { room: Room; me: string }) => {
  const names = companions(room, me);
  return (
    <p className="text-ink-primary text-sm">
      This ends the session for {names.length === 0 ? 'everyone' : `${listNames(names)} too`}.
    </p>
  );
};

/** On the result. `room` may be unknown (more than a day old): the line stays general. */
export const TogetherResultNote = ({
  room,
  me,
  outcome,
  endedBy,
}: {
  room: Room | null;
  me: string;
  outcome: 'completed' | 'cancelled';
  endedBy: string | null;
}) => {
  if (endedBy !== null) {
    return <p className="text-ink-secondary text-sm">{endedBy} ended the session for everyone.</p>;
  }
  if (outcome === 'cancelled') {
    return <p className="text-ink-secondary text-sm">You ended it for everyone.</p>;
  }
  const names = room === null ? [] : companions(room, me);
  return (
    <p className="text-ink-secondary text-sm">
      Focused together{names.length > 0 && ` with ${listNames(names)}`}. +10 Stardust once
      everyone&rsquo;s session has synced.
    </p>
  );
};
