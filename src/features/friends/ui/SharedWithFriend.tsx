import { useState, type ReactNode } from 'react';

import { FriendsFailure } from '../data/friendsRepository';
import { FRIENDS_MESSAGES } from '../domain/errors';
import { openWith, type DescribeShared, type SharedDraft } from '../domain/shared';
import type { Shared } from '../hooks/useShared';

const BUTTON =
  'rounded-pill border-night-600 text-ink-secondary hover:border-lavender-400 hover:text-ink-primary shrink-0 border px-4 py-1.5 text-xs transition-colors disabled:pointer-events-none disabled:opacity-50';

const messageOf = (e: unknown): string =>
  FRIENDS_MESSAGES[e instanceof FriendsFailure ? e.kind : 'unknown'];

/**
 * On a friend's page (M7 phase 5): start a shared constellation, answer or
 * withdraw a proposal, or see and stop the one you are building together.
 */
export const SharedWithFriend = ({
  friendId,
  friendName,
  shared,
  me,
  describe,
  renderPicker,
}: {
  friendId: string;
  friendName: string;
  shared: Shared;
  me: string;
  describe: DescribeShared;
  /** The shape picker, from the sky feature through `app/`. */
  renderPicker: (props: { onPick: (draft: SharedDraft) => void; onClose: () => void }) => ReactNode;
}) => {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (shared.rows === null) return null;
  const open = openWith(shared.rows, friendId, describe);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      setConfirming(false);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const body = (() => {
    if (open === null) {
      return (
        <button type="button" className={BUTTON} disabled={busy} onClick={() => setPicking(true)}>
          Start a shared constellation
        </button>
      );
    }
    const { name, stars, total } = describe(open);
    if (open.acceptedAt === null && open.proposedBy === me) {
      return (
        <>
          <span className="text-ink-secondary text-xs">
            You proposed {name}. Waiting for {friendName}.
          </span>
          <button
            type="button"
            className={BUTTON}
            disabled={busy}
            onClick={() => void run(() => shared.stop(open.id))}
          >
            Withdraw
          </button>
        </>
      );
    }
    if (open.acceptedAt === null) {
      return (
        <>
          <span className="text-ink-secondary text-xs">
            {friendName} wants to build {name} with you.
          </span>
          <span className="flex gap-2">
            <button
              type="button"
              className={BUTTON}
              disabled={busy}
              onClick={() => void run(() => shared.respond(open.id, true))}
            >
              Accept
            </button>
            <button
              type="button"
              className={BUTTON}
              disabled={busy}
              onClick={() => void run(() => shared.respond(open.id, false))}
            >
              Decline
            </button>
          </span>
        </>
      );
    }
    if (confirming) {
      return (
        <>
          <span className="text-ink-secondary text-xs">
            Stop {name}? It stays in both skies as it is, and you can start another.
          </span>
          <span className="flex gap-2">
            <button
              type="button"
              className={BUTTON}
              disabled={busy}
              onClick={() => void run(() => shared.stop(open.id))}
            >
              Stop it
            </button>
            <button type="button" className={BUTTON} onClick={() => setConfirming(false)}>
              Keep building
            </button>
          </span>
        </>
      );
    }
    return (
      <>
        <span className="text-ink-secondary text-xs">
          Building {name} together · {stars} of {total}
        </span>
        <button type="button" className={BUTTON} onClick={() => setConfirming(true)}>
          Stop
        </button>
      </>
    );
  })();

  return (
    <div className="flex flex-col items-center gap-2" aria-live="polite">
      <div className="flex flex-wrap items-center justify-center gap-2">{body}</div>
      {error !== null && (
        <p role="alert" className="text-faded text-xs">
          {error}
        </p>
      )}
      {picking &&
        renderPicker({
          onPick: (draft) => void run(() => shared.propose(friendId, draft)),
          onClose: () => setPicking(false),
        })}
    </div>
  );
};
