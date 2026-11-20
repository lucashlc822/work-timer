import type { FriendsLoad } from '../hooks/useFriends';
import type { FriendRow } from '../data/friendsRepository';
import type { FocusStatus } from '../domain/focusStatus';
import { friendsGlance, STATUS_PHRASE } from '../domain/glance';
import type { Presence } from '../domain/presence';

const DOT: Record<string, string> = {
  focusing: 'bg-lavender-400',
  break: 'bg-mint-300',
  online: 'bg-mint-300',
  away: 'bg-night-600',
};

/**
 * Who is around, on the home page: "Ada is focusing · Bea is online". Nothing
 * while it loads or when offline (a dash of noise helps nobody), a quiet
 * "Add a friend" with none, and a gentle line when no one is around. The
 * owner decides how often the data is read (`useFriends({ watching })`).
 */
export const FriendsGlance = ({
  load,
  friends,
  focus,
  presence,
  now,
  onOpen,
}: {
  load: FriendsLoad;
  friends: readonly FriendRow[];
  focus: ReadonlyMap<string, FocusStatus>;
  presence: ReadonlyMap<string, Presence>;
  now: number;
  onOpen: () => void;
}) => {
  if (load !== 'ready') return null;
  const { shown, more, total } = friendsGlance(friends, focus, presence, now);

  if (total === 0) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="text-lavender-200 hover:text-ink-primary inline-flex min-h-6 items-center px-1 text-xs underline-offset-4 hover:underline"
      >
        Add a friend
      </button>
    );
  }
  if (shown.length === 0) {
    // Secondary, not muted: this sits over the sky, where muted is ~2.6:1 (UI review H1).
    return <p className="text-ink-secondary text-xs">No one is around right now</p>;
  }
  return (
    <ul
      aria-label="Friends around"
      className="text-ink-secondary flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs"
    >
      {shown.map((f) => (
        <li key={f.id} className="flex items-center gap-1.5">
          <span aria-hidden className={`${DOT[f.status]} rounded-pill size-1.5`} />
          {f.name} {STATUS_PHRASE[f.status]}
        </li>
      ))}
      {more > 0 && <li>+{more} more</li>}
    </ul>
  );
};
