import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { FRIENDS_MESSAGES } from '../domain/errors';
import { statusLine, type FocusStatus } from '../domain/focusStatus';
import type { FriendSky } from '../domain/friendSky';
import { possessive } from '../domain/possessive';
import { useFriendSky } from '../hooks/useFriendSky';

/** The four numbers shown over a friend's sky. `app/` computes them. */
export interface FriendSummary {
  /** Already formatted, e.g. "2 h 05 min". */
  focusThisWeek: string;
  starsThisWeek: number;
  streakDays: number;
  constellations: number;
}

/** What `renderSky` is told about the header laid over the sky. */
export interface SkyLayout {
  /** Pixels the header covers from the top of the window. */
  reserveTop: number;
}

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
  status,
  now,
  shared,
}: {
  friendId: string;
  /** From the friend list, shown while the sky loads. */
  name: string | null;
  /** Draws the sky; lay it out below `layout.reserveTop`, where the header is. */
  renderSky: (sky: FriendSky, layout: SkyLayout) => ReactNode;
  summarize: (sky: FriendSky) => FriendSummary;
  /** What they're doing right now, if anything (M7 phase 3). */
  status: FocusStatus | null;
  now: number;
  /** The shared constellation line (M7 phase 5), shown once their sky has loaded. */
  shared?: ReactNode;
}) => {
  const { state, retry } = useFriendSky(friendId);
  // The header's height varies (a status line, the shared constellation, wrapping), and
  // the sky is laid out below it: read it before paint, and again whenever it changes.
  const headerRef = useRef<HTMLElement>(null);
  const [reserveTop, setReserveTop] = useState<number | null>(null);
  useLayoutEffect(() => {
    const header = headerRef.current;
    if (header === null) return;
    const read = () => {
      const height = header.offsetHeight;
      setReserveTop((prev) => (prev === height ? prev : height));
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(read);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  // Content that arrives with the sky changes the header's height in the same commit.
  useLayoutEffect(() => {
    const height = headerRef.current?.offsetHeight;
    if (height !== undefined) setReserveTop((prev) => (prev === height ? prev : height));
  }, [state.kind]);
  const shownName =
    (state.kind === 'ready' ? state.sky.displayName : null) ?? name ?? 'Your friend';

  return (
    <>
      {/* Not drawn until the header has been measured, so the stars never jump. */}
      {state.kind === 'ready' && reserveTop !== null && renderSky(state.sky, { reserveTop })}

      <header
        ref={headerRef}
        className="bg-night-900/70 border-night-600 fixed inset-x-0 top-0 z-20 flex flex-col items-center gap-3 border-b px-6 py-4 backdrop-blur"
      >
        <h2 className="text-ink-primary text-base">{possessive(shownName)} sky</h2>
        {statusLine(status, now) !== null && (
          <p className="text-lavender-200 text-xs">{statusLine(status, now)}</p>
        )}
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
        {state.kind === 'ready' && shared}
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
    <dt className="text-ink-secondary text-2xs">{label}</dt>
    <dd className="text-ink-primary text-sm">{value}</dd>
  </div>
);
