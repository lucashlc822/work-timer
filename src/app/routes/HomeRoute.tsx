import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  ConstellationStatus,
  installDevTools,
  NewStarNote,
  PackPreview,
  ResultStarGlyph,
  SkyBackdrop,
  StarGlyph,
  StartHint,
  ThemeSwatch,
  useEarnedTiers,
} from '@/features/sky';
import { AccountPanel } from '@/features/account';
import {
  FriendSkyView,
  FriendsPanel,
  FriendsPill,
  InviteBanner,
  TogetherCancelNote,
  TogetherLine,
  TogetherPanel,
  TogetherResultNote,
  useFriends,
  useShareFocusStatus,
  useTogether,
  type FriendRow,
  type Together,
} from '@/features/friends';
import {
  ProgressLine,
  RewardNote,
  StardustPanel,
  StardustPill,
  useBoughtTiers,
  useOwnedPacks,
} from '@/features/progression';
import { StatsView, installStatsDevTools } from '@/features/stats';
import { TagPicker } from '@/features/tags';
import {
  TimerProvider,
  TimerScreen,
  useTimer,
  type FinishedResult,
  type TimerSlots,
} from '@/features/timer';
import { APP_NAME } from '@/shared/config';
import { getRuntime, type AutostartPort } from '@/shared/runtime';
import { StarMark } from '@/shared/ui';

import { useAccount } from '../accountContext';
import { renderFriendSky, summarizeFriend } from '../friendSlots';
import { useTogetherTimer } from '../useTogetherTimer';

/**
 * Sky and Stardust content for the timer's slots. The features never import
 * each other; this is the one place they meet.
 */
const timerSlots: TimerSlots = {
  tagPicker: (props) => <TagPicker {...props} />,
  startHint: (plannedS) => <StartHint plannedS={plannedS} />,
  progressLine: () => <ProgressLine />,
  resultStar: (result) => (
    <ResultStarGlyph sessionId={result.sessionId} seed={result.seed} focusS={result.actualFocusS} />
  ),
  resultNote: (result) => (
    <>
      {result.outcome === 'completed' && <NewStarNote sessionId={result.sessionId} />}
      <RewardNote outcome={result.outcome} actualFocusS={result.actualFocusS} />
    </>
  ),
};

const NO_TIERS: ReadonlySet<'medium' | 'hard'> = new Set();
const NO_PACKS: ReadonlySet<string> = new Set();

/** The same star in each style, so the shop shows only what the style changes. */
const renderStylePreview = (styleKey: string) => (
  <StarGlyph seed="shop-preview" focusS={1500} style={styleKey} size={40} />
);

const renderThemePreview = (themeKey: string) => <ThemeSwatch theme={themeKey} />;
const renderPackPreview = (packKey: string) => <PackPreview pack={packKey} />;

/**
 * The main window: the timer in front of your night sky.
 *
 * "View sky", "Stats" and the Stardust pill fade the timer out — it stays mounted, so a running
 * session is untouched. The sky hands the pointer to the stars so they can be
 * hovered and focused; the stats are a scrollable panel over the dimmed sky.
 * The autostart toggle lives in the footer until a settings surface exists to
 * hold it.
 */
export const HomeRoute = () => {
  const { account } = useAccount();
  const together = useTogether(account.userId);
  const { cancel } = together;

  // Your own end-early in a focus-together session ends it for everyone (M7).
  const onEnded = useCallback(
    (result: FinishedResult) => {
      const roomId = result.session.togetherId;
      if (roomId !== null && result.ending.outcome === 'cancelled' && result.endedBy === null) {
        cancel(roomId);
      }
    },
    [cancel],
  );

  return (
    // The timer lives above the screen so the app can drive it too (M7).
    <TimerProvider onEnded={onEnded}>
      <HomeScreen together={together} />
    </TimerProvider>
  );
};

const HomeScreen = ({ together }: { together: Together }) => {
  const [view, setView] = useState<
    'timer' | 'sky' | 'stats' | 'stardust' | 'account' | 'friends' | 'friend' | 'together'
  >('timer');
  // The friend whose sky is open; kept after closing so "Back to friends" has somewhere to go.
  const [friend, setFriend] = useState<FriendRow | null>(null);
  const friends = useFriends({ watching: view === 'friends' || view === 'friend' });
  useShareFocusStatus();
  const { account, signOut, deleteAccount, sync, syncNow } = useAccount();
  const away = view !== 'timer';
  const boughtTiers = useBoughtTiers() ?? NO_TIERS;
  const ownedPacks = useOwnedPacks() ?? NO_PACKS;
  const earnedTiers = useEarnedTiers();

  const timer = useTimer();
  const me = account.userId;
  useTogetherTimer(together, timer, me);

  useEffect(installDevTools, []);
  useEffect(installStatsDevTools, []);

  // Once your friends session starts, the timer is where it is.
  const roomRunning = together.room?.status === 'running';
  useEffect(() => {
    if (view === 'together' && roomRunning) setView('timer');
  }, [view, roomRunning]);

  const hasFriends = friends.friends.length > 0;
  const inRoom = together.room !== null;
  const { rooms } = together;
  const slots = useMemo<TimerSlots>(() => {
    const roomOf = (id: string | null) =>
      id === null ? null : (rooms.find((r) => r.id === id) ?? null);
    return {
      ...timerSlots,
      startHint: (plannedS) => (
        <>
          <StartHint plannedS={plannedS} />
          {hasFriends && (
            <button
              type="button"
              onClick={() => setView('together')}
              className="text-lavender-200 hover:text-ink-primary text-xs underline-offset-4 transition-colors hover:underline"
            >
              {inRoom ? 'Back to your friends session' : 'Focus with friends'}
            </button>
          )}
        </>
      ),
      running: (session) => {
        const room = roomOf(session.togetherId);
        return room === null ? null : <TogetherLine room={room} me={me} />;
      },
      cancelNote: (session) => {
        const room = roomOf(session.togetherId);
        return room === null ? null : <TogetherCancelNote room={room} me={me} />;
      },
      resultNote: (result) => (
        <>
          {timerSlots.resultNote?.(result)}
          {result.togetherId !== null && (
            <TogetherResultNote
              room={roomOf(result.togetherId)}
              me={me}
              outcome={result.outcome}
              endedBy={result.endedBy}
            />
          )}
        </>
      ),
    };
  }, [rooms, hasFriends, inRoom, me]);

  useEffect(() => {
    if (view === 'timer') return;
    const onKey = (e: KeyboardEvent) => {
      // A friend's sky goes back to the friend list; everything else to the timer.
      if (e.key === 'Escape') setView(view === 'friend' ? 'friends' : 'timer');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [view]);

  return (
    <>
      <SkyBackdrop mode={view === 'sky' ? 'full' : 'hero'} />

      <main
        inert={away}
        className={`relative z-10 flex min-h-dvh flex-col items-center gap-8 px-6 pt-10 pb-6 transition-opacity duration-500 ${
          away ? 'pointer-events-none opacity-0' : ''
        }`}
      >
        <header className="flex items-center gap-2">
          <StarMark size={28} />
          <h1 className="text-ink-secondary text-sm tracking-widest uppercase">{APP_NAME}</h1>
        </header>

        {together.invite !== null && (
          <InviteBanner
            invite={together.invite}
            busy={timer.status !== 'idle'}
            onAnswer={together.respond}
          />
        )}

        <section className="flex w-full flex-1 flex-col items-center justify-center pt-24">
          <TimerScreen slots={slots} />
        </section>

        <footer className="flex flex-col items-center gap-3">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <ConstellationStatus boughtTiers={boughtTiers} ownedPacks={ownedPacks} />
            <StardustPill onOpen={() => setView('stardust')} />
            <button
              type="button"
              onClick={() => setView('sky')}
              className="rounded-pill border-night-600 text-ink-secondary hover:border-lavender-400 hover:text-ink-primary border px-4 py-1.5 text-xs transition-colors"
            >
              View sky
            </button>
            <button
              type="button"
              onClick={() => setView('stats')}
              className="rounded-pill border-night-600 text-ink-secondary hover:border-lavender-400 hover:text-ink-primary border px-4 py-1.5 text-xs transition-colors"
            >
              Stats
            </button>
            <FriendsPill waiting={friends.incoming.length} onOpen={() => setView('friends')} />
            <button
              type="button"
              onClick={() => setView('account')}
              className="rounded-pill border-night-600 text-ink-secondary hover:border-lavender-400 hover:text-ink-primary border px-4 py-1.5 text-xs transition-colors"
            >
              Account
            </button>
          </div>
          <AutostartToggle />
        </footer>
      </main>

      {view === 'stats' && (
        <div className="bg-night-900/85 fixed inset-0 z-10 overflow-y-auto backdrop-blur-sm">
          <StatsView />
        </div>
      )}

      {view === 'stardust' && (
        <div className="bg-night-900/85 fixed inset-0 z-10 overflow-y-auto backdrop-blur-sm">
          <StardustPanel
            userId={account.userId}
            earnedTiers={{ medium: earnedTiers?.medium ?? false, hard: earnedTiers?.hard ?? false }}
            renderStylePreview={renderStylePreview}
            renderThemePreview={renderThemePreview}
            renderPackPreview={renderPackPreview}
          />
        </div>
      )}

      {view === 'account' && (
        <div className="bg-night-900/85 fixed inset-0 z-10 overflow-y-auto backdrop-blur-sm">
          <AccountPanel
            email={account.email}
            sync={sync}
            onSyncNow={syncNow}
            onSignOut={signOut}
            onDeleteAccount={deleteAccount}
          />
        </div>
      )}

      {view === 'friends' && (
        <div className="bg-night-900/85 fixed inset-0 z-10 overflow-y-auto backdrop-blur-sm">
          <FriendsPanel
            friends={friends}
            now={Date.now()}
            onOpenFriend={(f) => {
              setFriend(f);
              setView('friend');
            }}
          />
        </div>
      )}

      {view === 'together' && (
        <div className="bg-night-900/85 fixed inset-0 z-10 overflow-y-auto backdrop-blur-sm">
          <TogetherPanel
            together={together}
            friends={friends.friends}
            me={me}
            busy={timer.status !== 'idle'}
          />
        </div>
      )}

      {view === 'friend' && friend !== null && (
        <div className="fixed inset-0 z-10">
          <FriendSkyView
            key={friend.friendId}
            friendId={friend.friendId}
            name={friend.displayName}
            renderSky={renderFriendSky}
            summarize={(sky) => summarizeFriend(sky, Date.now())}
            status={friends.focus.get(friend.friendId) ?? null}
            now={Date.now()}
          />
        </div>
      )}

      {away && (
        <button
          // Re-mounted per view, so autoFocus lands on it each time.
          key={view}
          type="button"
          autoFocus
          onClick={() => {
            if (view === 'friend') void friends.refresh();
            setView(view === 'friend' ? 'friends' : 'timer');
          }}
          className="rounded-pill bg-night-800/80 border-night-600 text-ink-secondary hover:text-ink-primary fixed bottom-6 left-1/2 z-20 -translate-x-1/2 border px-5 py-2 text-xs backdrop-blur transition-colors"
        >
          {view === 'friend' ? 'Back to friends' : 'Back to timer'}
        </button>
      )}
    </>
  );
};

const AutostartToggle = () => {
  const [autostart, setAutostart] = useState<AutostartPort | null>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getRuntime().then(async (host) => {
      if (cancelled || !host.autostart.isSupported) return;
      const on = await host.autostart.isEnabled();
      if (cancelled) return;
      setAutostart(host.autostart);
      setEnabled(on);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (autostart === null) return null;

  const toggle = async () => {
    await autostart.setEnabled(!enabled);
    setEnabled(await autostart.isEnabled());
  };

  return (
    <label className="text-ink-muted hover:text-ink-secondary flex cursor-pointer items-center gap-2 text-xs transition-colors">
      <input
        type="checkbox"
        checked={enabled}
        onChange={() => void toggle()}
        className="accent-lavender-400"
      />
      Launch at startup
    </label>
  );
};
