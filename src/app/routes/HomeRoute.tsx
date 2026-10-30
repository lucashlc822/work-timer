import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import {
  activeShared,
  ConstellationStatus,
  installDevTools,
  NewStarNote,
  PackPreview,
  ResultStarGlyph,
  SharedPicker,
  SharedStartHint,
  SkyBackdrop,
  StarGlyph,
  StartHint,
  TargetPicker,
  ThemeSwatch,
  useEarnedTiers,
} from '@/features/sky';
import { AccountPanel } from '@/features/account';
import {
  FOCUS_POLL_MS,
  FriendSkyView,
  FriendsPanel,
  FriendsPill,
  incomingProposals,
  InviteBanner,
  SharedWithFriend,
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
import { clearMeta, db, META_KEYS, readMeta, writeMeta } from '@/shared/db';
import { getRuntime, type AutostartPort } from '@/shared/runtime';
import { StarMark, useFocusIfLost } from '@/shared/ui';

import { useAccount } from '../accountContext';
import { renderFriendSky, summarizeFriend } from '../friendSlots';
import { useSharedSky } from '../sharedSkyContext';
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

/** The views that scroll over the timer; each gets a footer for its Back button. */
const PANEL_VIEWS: ReadonlySet<string> = new Set([
  'stats',
  'stardust',
  'account',
  'friends',
  'together',
]);

/**
 * A panel over the dimmed sky: the content scrolls above a footer that holds
 * the Back button, so the button never sits on top of the content.
 */
const PanelLayer = ({ children, back }: { children: ReactNode; back: ReactNode }) => (
  <div className="bg-night-900/85 fixed inset-0 z-10 flex flex-col backdrop-blur-sm">
    <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    <footer className="border-night-700 flex justify-center border-t py-3">{back}</footer>
  </div>
);

/** "Back to timer" / "Back to friends": in a panel's footer, or floating over a view that doesn't scroll. */
const BackButton = ({
  label,
  floating,
  onClick,
}: {
  label: string;
  floating: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    autoFocus
    onClick={onClick}
    className={`rounded-pill border-night-600 text-ink-secondary hover:text-ink-primary border px-5 py-2 text-xs transition-colors ${
      floating
        ? 'bg-night-800/80 fixed bottom-6 left-1/2 z-20 -translate-x-1/2 backdrop-blur'
        : 'bg-night-800'
    }`}
  >
    {label}
  </button>
);

/** A footer navigation button: no outline, so the row reads as links, not choices. */
const NAV_BUTTON =
  'rounded-pill text-ink-secondary hover:text-ink-primary hover:bg-night-800/60 px-3 py-1.5 text-xs transition-colors';

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

type View = 'timer' | 'sky' | 'stats' | 'stardust' | 'account' | 'friends' | 'friend' | 'together';

const HomeScreen = ({ together }: { together: Together }) => {
  const [view, setView] = useState<View>('timer');
  // The timer-screen control that opened the current panel. The timer screen
  // stays mounted (inert) underneath, so closing the panel can hand focus back
  // to it instead of letting it fall to the page with the Back button.
  const opener = useRef<HTMLElement | null>(null);
  const openView = useCallback((next: View) => {
    if (document.activeElement instanceof HTMLElement) opener.current = document.activeElement;
    setView(next);
  }, []);
  useFocusIfLost(opener, view === 'timer');
  // The friend whose sky is open; kept after closing so "Back to friends" has somewhere to go.
  const [friend, setFriend] = useState<FriendRow | null>(null);
  const friends = useFriends({ watching: view === 'friends' || view === 'friend' });
  useShareFocusStatus();
  const { account, signOut, deleteAccount, sync, syncNow } = useAccount();
  const away = view !== 'timer';
  const inPanel = PANEL_VIEWS.has(view);
  const boughtTiers = useBoughtTiers() ?? NO_TIERS;
  const ownedPacks = useOwnedPacks() ?? NO_PACKS;
  const earnedTiers = useEarnedTiers();

  const timer = useTimer();
  const me = account.userId;
  useTogetherTimer(together, timer, me);

  // Shared constellations (M7 phase 5): what the next session is for. The last
  // pick is kept per device; one that is no longer active means your own sky.
  const { shared, states: sharedStates, describe: describeShared } = useSharedSky();
  const storedTarget = useLiveQuery(() => readMeta<unknown>(db, META_KEYS.lastSharedTarget), []);
  const activeTargets = activeShared(sharedStates);
  const target =
    typeof storedTarget === 'string' && activeTargets.some((s) => s.choice.id === storedTarget)
      ? storedTarget
      : null;
  const targetState = activeTargets.find((s) => s.choice.id === target) ?? null;
  const setTarget = useCallback((id: string | null) => {
    void (id === null
      ? clearMeta(db, META_KEYS.lastSharedTarget)
      : writeMeta(db, META_KEYS.lastSharedTarget, id));
  }, []);
  // Behind the timer: what is running, or else what the next session is for.
  const focusId = timer.session?.sharedId ?? target;

  // While a Friends screen is open, proposals arrive as quickly as friend requests do.
  const { refresh: refreshShared } = shared;
  const onFriendsScreen = view === 'friends' || view === 'friend';
  useEffect(() => {
    if (!onFriendsScreen) return;
    void refreshShared();
    const timer = window.setInterval(() => void refreshShared(), FOCUS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [onFriendsScreen, refreshShared]);

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
      targetPicker: ({ disabled }) => (
        <TargetPicker
          shared={sharedStates}
          value={target}
          onChange={setTarget}
          disabled={disabled}
        />
      ),
      startHint: (plannedS) => (
        <>
          {targetState === null ? (
            <StartHint plannedS={plannedS} />
          ) : (
            <SharedStartHint shared={targetState} plannedS={plannedS} />
          )}
          {hasFriends && (
            <button
              type="button"
              onClick={() => openView('together')}
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
  }, [rooms, hasFriends, inRoom, me, sharedStates, target, targetState, setTarget, openView]);

  useEffect(() => {
    if (view === 'timer') return;
    const onKey = (e: KeyboardEvent) => {
      // A friend's sky goes back to the friend list; everything else to the timer.
      if (e.key === 'Escape') setView(view === 'friend' ? 'friends' : 'timer');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [view]);

  const back = (
    <BackButton
      // Re-mounted per view, so autoFocus lands on it each time.
      key={view}
      label={view === 'friend' ? 'Back to friends' : 'Back to timer'}
      floating={!inPanel}
      onClick={() => {
        if (view === 'friend') void friends.refresh();
        setView(view === 'friend' ? 'friends' : 'timer');
      }}
    />
  );

  return (
    <>
      <SkyBackdrop
        mode={view === 'sky' ? 'full' : 'hero'}
        shared={sharedStates}
        focusId={focusId}
      />

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

        <section className="flex w-full flex-1 flex-col items-center justify-center">
          <TimerScreen slots={slots} sharedId={target} />
        </section>

        <footer className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
          {/* Your progress: what you are building and what you have earned. */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <ConstellationStatus boughtTiers={boughtTiers} ownedPacks={ownedPacks} />
            <StardustPill onOpen={() => openView('stardust')} />
          </div>
          <span aria-hidden className="bg-night-600 hidden h-4 w-px sm:block" />
          {/* Navigation: quieter, no outline. */}
          <nav aria-label="Main" className="flex flex-wrap items-center justify-center gap-1">
            <button type="button" onClick={() => openView('sky')} className={NAV_BUTTON}>
              View sky
            </button>
            <button type="button" onClick={() => openView('stats')} className={NAV_BUTTON}>
              Stats
            </button>
            <FriendsPill
              waiting={friends.incoming.length + incomingProposals(shared.rows, me).length}
              onOpen={() => openView('friends')}
            />
            <button type="button" onClick={() => openView('account')} className={NAV_BUTTON}>
              Account
            </button>
          </nav>
        </footer>
      </main>

      {view === 'stats' && (
        <PanelLayer back={back}>
          <StatsView />
        </PanelLayer>
      )}

      {view === 'stardust' && (
        <PanelLayer back={back}>
          <StardustPanel
            userId={account.userId}
            earnedTiers={{ medium: earnedTiers?.medium ?? false, hard: earnedTiers?.hard ?? false }}
            renderStylePreview={renderStylePreview}
            renderThemePreview={renderThemePreview}
            renderPackPreview={renderPackPreview}
          />
        </PanelLayer>
      )}

      {view === 'account' && (
        <PanelLayer back={back}>
          <AccountPanel
            email={account.email}
            sync={sync}
            onSyncNow={syncNow}
            onSignOut={signOut}
            onDeleteAccount={deleteAccount}
            deviceSettings={<AutostartToggle />}
          />
        </PanelLayer>
      )}

      {view === 'friends' && (
        <PanelLayer back={back}>
          <FriendsPanel
            friends={friends}
            now={Date.now()}
            shared={{ shared, me, describe: describeShared }}
            onOpenFriend={(f) => {
              setFriend(f);
              setView('friend');
            }}
          />
        </PanelLayer>
      )}

      {view === 'together' && (
        <PanelLayer back={back}>
          <TogetherPanel
            together={together}
            friends={friends.friends}
            me={me}
            busy={timer.status !== 'idle'}
          />
        </PanelLayer>
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
            shared={
              <SharedWithFriend
                friendId={friend.friendId}
                friendName={friend.displayName ?? 'your friend'}
                shared={shared}
                me={me}
                describe={describeShared}
                // Portalled: the header's backdrop blur would trap a fixed dialog inside it.
                renderPicker={({ onPick, onClose }) =>
                  createPortal(
                    <SharedPicker
                      boughtTiers={boughtTiers}
                      ownedPacks={ownedPacks}
                      onPick={onPick}
                      onClose={onClose}
                    />,
                    document.body,
                  )
                }
              />
            }
          />
        </div>
      )}

      {away && !inPanel && back}
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

  // A switch drawn over the native checkbox, which stays the control (so it is
  // still a checkbox named "Launch at startup" to the keyboard and to tests).
  return (
    <section className="bg-night-800/70 border-night-600 rounded-soft flex flex-col gap-3 border p-4 text-sm">
      <h3 className="text-ink-primary">This computer</h3>
      <label className="text-ink-secondary hover:text-ink-primary flex cursor-pointer items-center justify-between gap-3 transition-colors">
        Launch at startup
        {/* The input is transparent and fills the track, so it is what a click
            lands on (a hidden input under the label can't be clicked directly). */}
        <span className="relative h-5 w-9 shrink-0">
          <input
            type="checkbox"
            checked={enabled}
            onChange={() => void toggle()}
            className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
          <span
            aria-hidden
            className="bg-night-600 peer-checked:bg-lavender-400 peer-focus-visible:outline-lavender-300 ease-gentle rounded-pill after:bg-ink-primary pointer-events-none absolute inset-0 transition-colors duration-300 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 after:absolute after:top-0.5 after:left-0.5 after:h-4 after:w-4 after:rounded-full after:transition-transform after:duration-300 peer-checked:after:translate-x-4"
          />
        </span>
      </label>
    </section>
  );
};
