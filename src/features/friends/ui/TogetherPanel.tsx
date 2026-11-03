import { useState } from 'react';

import { FriendsFailure, type FriendRow } from '../data/friendsRepository';
import { FRIENDS_MESSAGES } from '../domain/errors';
import { MAX_INVITEES } from '../domain/room';
import type { Together } from '../hooks/useTogether';

const CARD = 'bg-night-800/70 border-night-600 flex flex-col gap-3 rounded-soft border p-4 text-sm';
const PRIMARY =
  'rounded-pill bg-lavender-400 text-night-900 hover:bg-lavender-300 px-5 py-2 text-sm transition-colors disabled:pointer-events-none disabled:opacity-50';

/** The lengths on offer, in minutes: the same as the timer's presets. */
const LENGTHS = [25, 50, 90] as const;

const messageOf = (e: unknown): string =>
  FRIENDS_MESSAGES[e instanceof FriendsFailure ? e.kind : 'unknown'];

/**
 * Focus together (M7 phase 4): pick up to three friends and a length and
 * invite them. Anyone's deliberate end-early ends it for everyone; the panel
 * says so before anything is sent. Once there is a room, the app closes this
 * panel: the lobby (`TogetherLobby`) lives on the timer screen.
 */
export const TogetherPanel = ({
  together,
  friends,
  busy,
}: {
  together: Together;
  /** Accepted friends. */
  friends: readonly FriendRow[];
  /** A session is already running here: nothing new can start. */
  busy: boolean;
}) => (
  <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-6 pt-10 pb-10">
    <header className="flex flex-col items-center gap-1">
      <h2 className="text-ink-secondary text-sm tracking-widest uppercase">Focus together</h2>
    </header>
    {together.room !== null ? (
      <section className={CARD}>
        <p className="text-ink-secondary">Your friends session is on the timer screen.</p>
      </section>
    ) : (
      <Setup together={together} friends={friends} busy={busy} />
    )}
  </div>
);

const Setup = ({
  together,
  friends,
  busy,
}: {
  together: Together;
  friends: readonly FriendRow[];
  busy: boolean;
}) => {
  const [picked, setPicked] = useState<string[]>([]);
  const [minutes, setMinutes] = useState<number>(LENGTHS[0]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) =>
    setPicked((now) => (now.includes(id) ? now.filter((p) => p !== id) : [...now, id]));

  const invite = async () => {
    setSending(true);
    setError(null);
    try {
      await together.create(picked, minutes * 60);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setSending(false);
    }
  };

  if (friends.length === 0) {
    return (
      <section className={CARD}>
        <p className="text-ink-secondary">Add a friend first: open Friends and share your code.</p>
      </section>
    );
  }

  return (
    <>
      <fieldset className={CARD}>
        <legend className="text-ink-primary mb-2">Who with</legend>
        <ul className="flex flex-col gap-2">
          {friends.map((f) => {
            const checked = picked.includes(f.friendId);
            return (
              <li key={f.friendId}>
                <label className="text-ink-secondary flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!checked && picked.length >= MAX_INVITEES}
                    onChange={() => toggle(f.friendId)}
                  />
                  {f.displayName ?? 'A friend'}
                </label>
              </li>
            );
          })}
        </ul>
        <p className="text-ink-muted text-xs">Up to three friends.</p>
      </fieldset>

      <fieldset className={CARD}>
        <legend className="text-ink-primary mb-2">How long</legend>
        <div className="flex gap-4">
          {LENGTHS.map((m) => (
            <label key={m} className="text-ink-secondary flex items-center gap-2">
              <input
                type="radio"
                name="together-length"
                checked={minutes === m}
                onChange={() => setMinutes(m)}
              />
              {m} min
            </label>
          ))}
        </div>
      </fieldset>

      <section className="flex flex-col items-center gap-2 text-center">
        <p className="text-ink-secondary text-xs">
          You&rsquo;ll all start and end at the same moment. If anyone ends early, it ends for
          everyone.
        </p>
        <button
          type="button"
          className={PRIMARY}
          disabled={picked.length === 0 || sending || busy}
          onClick={() => void invite()}
        >
          {sending ? 'Inviting…' : 'Invite'}
        </button>
        {busy && (
          <p className="text-ink-muted text-xs">Finish the session that&rsquo;s running first.</p>
        )}
        {error !== null && (
          <p role="alert" className="text-faded text-xs">
            {error}
          </p>
        )}
      </section>
    </>
  );
};
