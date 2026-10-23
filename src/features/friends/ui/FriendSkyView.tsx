import type { ReactNode } from 'react';

import { FRIENDS_MESSAGES } from '../domain/errors';
import type { FriendSky } from '../domain/friendSky';
import { useFriendSky } from '../hooks/useFriendSky';

/** The four numbers shown over a friend's sky. `app/` computes them. */
export interface FriendSummary {
  /** Already formatted, e.g. "2 h 05 min". */
  focusThisWeek: string;
  starsThisWeek: number;
  streakDays: number;
  constellations: number;
}

const possessive = (name: string): string => (name.endsWith('s') ? `${name}'` : `${name}'s`);

/**
 * A friend's sky, full screen, with their name and a few numbers on a strip
 * at the top (M7). The sky itself and the numbers come from `app/`, which
 * owns the sky, stats and progression features.
 */
export const FriendSkyView = ({
  friendId,
  name,
  renderSky,
  summarize,
}: {
  friendId: string;
  /** From the friend list, shown while the sky loads. */
  name: string | null;
  renderSky: (sky: FriendSky) => ReactNode;
  summarize: (sky: FriendSky) => FriendSummary;
}) => {
  const { state, retry } = useFriendSky(friendId);
  const shownName =
    (state.kind === 'ready' ? state.sky.displayName : null) ?? name ?? 'Your friend';

  return (
    <>
      {state.kind === 'ready' && renderSky(state.sky)}

      <header className="bg-night-900/70 border-night-600 fixed inset-x-0 top-0 z-20 flex flex-col items-center gap-3 border-b px-6 py-4 backdrop-blur">
        <h2 className="text-ink-primary text-base">{possessive(shownName)} sky</h2>
        {state.kind === 'loading' && <p className="text-ink-secondary text-xs">Loading…</p>}
        {state.kind === 'failed' && (
          <div className="flex flex-col items-center gap-2">
            <p role="alert" className="text-ink-secondary text-xs">
              {FRIENDS_MESSAGES[state.reason]}
            </p>
            {state.reason !== 'notFriends' && (
              <button
                type="button"
                onClick={retry}
                className="rounded-pill border-night-600 text-ink-secondary hover:border-lavender-400 hover:text-ink-primary border px-4 py-1.5 text-xs transition-colors"
              >
                Try again
              </button>
            )}
          </div>
        )}
        {state.kind === 'ready' && <Numbers summary={summarize(state.sky)} />}
      </header>
    </>
  );
};

const Numbers = ({ summary }: { summary: FriendSummary }) => (
  <dl className="grid grid-cols-4 gap-4 text-center">
    <Stat label="Focus this week" value={summary.focusThisWeek} />
    <Stat label="Stars this week" value={String(summary.starsThisWeek)} />
    <Stat
      label="Streak"
      value={`${summary.streakDays} ${summary.streakDays === 1 ? 'day' : 'days'}`}
    />
    <Stat label="Constellations" value={String(summary.constellations)} />
  </dl>
);

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="flex flex-col-reverse gap-0.5">
    <dt className="text-ink-secondary text-[11px]">{label}</dt>
    <dd className="text-ink-primary text-sm">{value}</dd>
  </div>
);
