import { useState } from 'react';

import { FriendsFailure, type FriendRow } from '../data/friendsRepository';
import { FRIENDS_MESSAGES } from '../domain/errors';
import { MAX_INVITEES, nameOf, stateOf, type MemberState, type Room } from '../domain/room';
import type { Together } from '../hooks/useTogether';

const CARD = 'bg-night-800/70 border-night-600 flex flex-col gap-3 rounded-soft border p-4 text-sm';
const BUTTON =
  'rounded-pill border-night-600 text-ink-secondary hover:border-lavender-400 hover:text-ink-primary border px-4 py-1.5 text-xs transition-colors disabled:pointer-events-none disabled:opacity-50';
const PRIMARY =
  'rounded-pill bg-lavender-400 text-night-900 hover:bg-lavender-300 px-5 py-2 text-sm transition-colors disabled:pointer-events-none disabled:opacity-50';

/** The lengths on offer, in minutes: the same as the timer's presets. */
const LENGTHS = [25, 50, 90] as const;

const STATE_LABEL: Record<MemberState, string> = {
  joined: 'In',
  invited: 'Invited',
  declined: 'Said no',
  left: 'Left',
  missed: 'Missed it',
};

const messageOf = (e: unknown): string =>
  FRIENDS_MESSAGES[e instanceof FriendsFailure ? e.kind : 'unknown'];

/**
 * Focus together (M7 phase 4): pick up to three friends and a length, invite
 * them, and start once anyone has joined. Anyone's deliberate end-early ends
 * it for everyone; the panel says so before anything is sent.
 */
export const TogetherPanel = ({
  together,
  friends,
  me,
  busy,
}: {
  together: Together;
  /** Accepted friends. */
  friends: readonly FriendRow[];
  me: string;
  /** A session is already running here: nothing new can start. */
  busy: boolean;
}) => (
  <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-6 pt-10 pb-28">
    <header className="flex flex-col items-center gap-1">
      <h2 className="text-ink-secondary text-sm tracking-widest uppercase">Focus together</h2>
    </header>
    {together.room !== null ? (
      <Lobby room={together.room} together={together} me={me} />
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

const Lobby = ({ room, together, me }: { room: Room; together: Together; me: string }) => {
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isHost = room.host === me;
  const someoneJoined = room.members.some((m) => m.userId !== me && m.state === 'joined');

  const run = async (action: () => Promise<void>) => {
    setActing(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setActing(false);
    }
  };

  if (room.status === 'running') {
    return (
      <section className={CARD}>
        <p className="text-ink-primary">You&rsquo;re focusing together now.</p>
        <p className="text-ink-secondary text-xs">Your timer is running; go back to it.</p>
      </section>
    );
  }

  return (
    <>
      <section className={CARD} aria-labelledby="lobby-title">
        <h3 id="lobby-title" className="text-ink-primary">
          {Math.round(room.plannedDurationS / 60)} min together
        </h3>
        <ul className="flex flex-col gap-1">
          {room.members.map((m) => (
            <li key={m.userId} className="flex items-center justify-between">
              <span className="text-ink-secondary">
                {m.userId === me ? 'You' : (m.displayName ?? 'A friend')}
                {m.userId === room.host && ' (host)'}
              </span>
              <span className="text-ink-muted text-xs">{STATE_LABEL[m.state]}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col items-center gap-2 text-center">
        {isHost ? (
          <>
            <button
              type="button"
              className={PRIMARY}
              disabled={!someoneJoined || acting}
              onClick={() => void run(() => together.start(room.id))}
            >
              Start
            </button>
            {!someoneJoined && (
              <p className="text-ink-muted text-xs">Start opens once a friend has joined.</p>
            )}
            <button
              type="button"
              className={BUTTON}
              disabled={acting}
              onClick={() => void run(() => together.leave(room.id))}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <p className="text-ink-secondary text-xs" aria-live="polite">
              Waiting for {nameOf(room, room.host)} to start.
            </p>
            <button
              type="button"
              className={BUTTON}
              disabled={acting || stateOf(room, me) !== 'joined'}
              onClick={() => void run(() => together.leave(room.id))}
            >
              Leave
            </button>
          </>
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
