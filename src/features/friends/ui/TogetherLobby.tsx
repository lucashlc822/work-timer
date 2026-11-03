import { useEffect, useRef, useState } from 'react';

import { StarMark, useFocusIfLost } from '@/shared/ui';

import { FriendsFailure } from '../data/friendsRepository';
import { FRIENDS_MESSAGES } from '../domain/errors';
import {
  lobbyMinutesLeft,
  lobbyOrder,
  nameOf,
  nobodyComing,
  stateOf,
  type MemberState,
  type Room,
  type RoomMember,
} from '../domain/room';
import type { Together } from '../hooks/useTogether';

const STATE_LABEL: Record<MemberState, string> = {
  joined: 'In',
  invited: 'Invited',
  declined: 'Said no',
  left: 'Left',
  missed: 'Missed it',
};

/**
 * Each member as a star: lit once they're in, breathing gently while the
 * invitation waits for them, faint once they won't come. The twinkle reuses
 * the sky's keyframes; the global reduced-motion rule stills it.
 */
const STAR_LOOK: Record<MemberState, string> = {
  joined: 'opacity-100 scale-100',
  invited: 'opacity-50 scale-90',
  declined: 'opacity-15 scale-75',
  left: 'opacity-15 scale-75',
  missed: 'opacity-15 scale-75',
};
const TWINKLE = { animation: 'sky-twinkle var(--duration-twinkle) ease-in-out infinite' };

/** Minutes left on the invitation, re-read every 15 s so the count stays honest. */
const useMinutesLeft = (room: Room): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  return lobbyMinutesLeft(room, now);
};

const Member = ({ member, room, me }: { member: RoomMember; room: Room; me: string }) => (
  <li className="flex w-16 flex-col items-center gap-1 text-center">
    {/* The twinkle animates opacity, so it sits inside the dimming, not on it. */}
    <span className={`ease-gentle transition duration-500 ${STAR_LOOK[member.state]}`}>
      <span
        data-testid="member-star"
        className="block"
        style={member.state === 'invited' ? TWINKLE : undefined}
      >
        <StarMark size={44} />
      </span>
    </span>
    <span className="text-ink-primary max-w-full truncate text-sm">
      {member.userId === me ? 'You' : (member.displayName ?? 'A friend')}
    </span>
    <span className="text-ink-secondary text-2xs">
      {member.userId === room.host ? 'Host' : STATE_LABEL[member.state]}
    </span>
  </li>
);

/**
 * The lobby you're in, shown by `app/` in place of the timer's start controls
 * (no solo session can start while you wait): who's in, who's still invited,
 * how long the invitation stays open, and what happens next.
 *
 * Takes focus when it appears in place of the control that had it (Join), or
 * when the panel that covered it closes (Invite).
 */
export const TogetherLobby = ({
  room,
  together,
  me,
  active,
}: {
  room: Room;
  together: Together;
  me: string;
  /** Nothing covers it: it may take a focus that was lost. */
  active: boolean;
}) => {
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useFocusIfLost(titleRef, active);
  const minutesLeft = useMinutesLeft(room);

  const isHost = room.host === me;
  const someoneJoined = room.members.some((m) => m.userId !== me && m.state === 'joined');
  const run = async (action: () => Promise<void>) => {
    setActing(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(FRIENDS_MESSAGES[e instanceof FriendsFailure ? e.kind : 'unknown']);
    } finally {
      setActing(false);
    }
  };

  let waiting: string;
  if (!isHost) waiting = `Waiting for ${nameOf(room, room.host)} to start.`;
  else if (someoneJoined) waiting = 'Everyone who’s in is ready. Start when you are.';
  else if (nobodyComing(room)) waiting = 'Nobody could make it this time.';
  else waiting = 'Start opens once a friend has joined.';

  return (
    <section
      aria-labelledby="lobby-title"
      className="rounded-soft border-night-600/60 bg-night-800/50 flex w-full flex-col items-center gap-6 border px-6 py-6 backdrop-blur-md sm:px-8 sm:py-8"
    >
      <header className="flex flex-col items-center gap-1 text-center">
        <p className="text-ink-secondary text-xs tracking-widest uppercase">Focus together</p>
        <h2
          id="lobby-title"
          ref={titleRef}
          tabIndex={-1}
          className="text-ink-primary text-2xl font-light outline-none"
        >
          {Math.round(room.plannedDurationS / 60)} min together
        </h2>
      </header>

      <ul aria-label="Who’s coming" className="flex flex-wrap justify-center gap-4">
        {lobbyOrder(room, me).map((m) => (
          <Member key={m.userId} member={m} room={room} me={me} />
        ))}
      </ul>

      <div className="flex flex-col items-center gap-1 text-center">
        <p className="text-ink-primary text-sm text-balance" aria-live="polite">
          {waiting}
        </p>
        <p className="text-ink-secondary text-xs text-balance">
          {minutesLeft > 0
            ? `Invite open for ${minutesLeft} more min.`
            : 'The invite is about to run out.'}{' '}
          You&rsquo;ll all start and end together; if anyone ends early, it ends for everyone.
        </p>
      </div>

      <div className="flex flex-col items-center gap-2">
        {isHost ? (
          <>
            <button
              type="button"
              disabled={!someoneJoined || acting}
              onClick={() => void run(() => together.start(room.id))}
              className="rounded-pill bg-lavender-400 text-night-900 hover:bg-lavender-300 shadow-lavender-400/25 hover:shadow-lavender-400/40 px-12 py-3.5 text-base font-medium shadow-lg transition disabled:opacity-60 disabled:shadow-none"
            >
              Start together
            </button>
            <button
              type="button"
              disabled={acting}
              onClick={() => void run(() => together.leave(room.id))}
              className="rounded-pill text-ink-secondary hover:text-ink-primary px-4 py-1.5 text-xs transition-colors disabled:opacity-50"
            >
              Cancel invite
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={acting || stateOf(room, me) !== 'joined'}
            onClick={() => void run(() => together.leave(room.id))}
            className="rounded-pill border-night-600 text-ink-secondary hover:border-lavender-400 hover:text-ink-primary border px-4 py-1.5 text-xs transition-colors disabled:opacity-50"
          >
            Leave
          </button>
        )}
        {error !== null && (
          <p role="alert" className="text-faded text-xs">
            {error}
          </p>
        )}
      </div>
    </section>
  );
};
