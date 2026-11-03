import { useEffect, useRef, useState } from 'react';

import { useDialogFocus } from '@/shared/ui';

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

/**
 * Start pressed while an invitation waits: starting alone says no to it, so
 * ask. "Not now" is the default focus and Escape means not now.
 */
export const StartAloneDialog = ({
  invite,
  onAnswer,
  onClose,
}: {
  invite: Room;
  onAnswer: (roomId: string, join: boolean) => Promise<void>;
  /** `true` once the invitation is declined and the session may start. */
  onClose: (start: boolean) => void;
}) => {
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const notNowRef = useRef<HTMLButtonElement>(null);
  useDialogFocus(dialogRef, notNowRef);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const startAlone = async () => {
    setActing(true);
    setError(null);
    try {
      await onAnswer(invite.id, false);
      onClose(true);
    } catch (e) {
      setError(FRIENDS_MESSAGES[e instanceof FriendsFailure ? e.kind : 'unknown']);
      setActing(false);
    }
  };

  const host = nameOf(invite, invite.host);
  return (
    <div className="bg-night-950/70 fixed inset-0 z-40 flex items-center justify-center p-4 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="start-alone-title"
        aria-describedby="start-alone-body"
        className="rounded-soft border-night-600 bg-night-800 w-full max-w-xs space-y-4 border p-5 text-center"
      >
        <h2 id="start-alone-title" className="text-ink-primary text-lg">
          Start on your own?
        </h2>
        <p id="start-alone-body" className="text-ink-secondary text-sm">
          {host} invited you to focus together. Starting on your own says no to that invitation.
        </p>
        <div className="flex flex-col gap-2">
          <button
            ref={notNowRef}
            type="button"
            disabled={acting}
            onClick={() => onClose(false)}
            className="rounded-pill bg-lavender-400 text-night-900 hover:bg-lavender-300 px-5 py-2 text-sm transition-colors disabled:opacity-50"
          >
            Not now
          </button>
          <button
            type="button"
            disabled={acting}
            onClick={() => void startAlone()}
            className="rounded-pill text-ink-secondary hover:text-ink-primary px-5 py-2 text-sm transition-colors disabled:opacity-50"
          >
            {acting ? 'Starting…' : 'Start on my own'}
          </button>
        </div>
        {error !== null && (
          <p role="alert" className="text-faded text-xs">
            {error}
          </p>
        )}
      </div>
    </div>
  );
};

/** Under the running clock, when your friends session started while this one ran. */
export const MissedStartNote = ({ room, me }: { room: Room; me: string }) => {
  const names = companions(room, me);
  return (
    <p className="text-ink-secondary text-xs">
      Your friends session{names.length > 0 && ` with ${listNames(names)}`} started while this one
      was running.
    </p>
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
