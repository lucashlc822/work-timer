import { useLiveQuery } from 'dexie-react-hooks';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
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
  StartHint,
  StylePreview,
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
  isLobby,
  lobbyEnded,
  LobbyEndedNote,
  missedStart,
  MissedStartNote,
  SharedWithFriend,
  StartAloneDialog,
  TogetherCancelNote,
  TogetherCompanions,
  TogetherLobby,
  OnlineToggle,
  TogetherPanel,
  TogetherResultNote,
  useFriends,
  useShareFocusStatus,
  useSharePresence,
  useTogether,
  type FriendRow,
  type Room,
  type Together,
} from '@/features/friends';
import {
  ProgressLine,
  RewardNote,
  StardustPanel,
  StardustPill,
  styleName,
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
import { StarMark, Switch, useFocusHeading, useFocusIfLost } from '@/shared/ui';

import { useAccount } from '../accountContext';
import { renderFriendSky, summarizeFriend } from '../friendSlots';
import { useSharedSky } from '../sharedSkyContext';
import { useRememberTogetherNames } from '../togetherNames';
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
 * the Back button, so the button never sits on top of the content. It opens
 * on the panel's title, so the first control is one Tab away and Back is the
 * last stop; with no title, on Back, so focus never falls to the page.
 */
const PanelLayer = ({
  children,
  back,
  backRef,
}: {
  children: ReactNode;
  back: ReactNode;
  backRef: RefObject<HTMLButtonElement | null>;
}) => {
  const content = useRef<HTMLDivElement>(null);
  useFocusHeading(content, backRef);
  return (
    <div className="bg-night-900/85 fixed inset-0 z-10 flex flex-col backdrop-blur-sm">
      <div ref={content} className="min-h-0 flex-1 overflow-y-auto">
        {children}
      </div>
      <footer className="border-night-700 flex justify-center border-t py-3">{back}</footer>
    </div>
  );
};

/** "Back to timer" / "Back to friends": in a panel's footer, or floating over a view that doesn't scroll. */
const BackButton = ({
  label,
  floating,
  buttonRef,
  onClick,
}: {
  label: string;
  floating: boolean;
  buttonRef: RefObject<HTMLButtonElement | null>;
  onClick: () => void;
}) => (
  <button
    ref={buttonRef}
    type="button"
    // A floating Back is the only control over a sky; in a panel the title is focused instead.
    autoFocus={floating}
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
const renderStylePreview = (styleKey: string, size?: number) => (
  <StylePreview styleKey={styleKey} size={size} />
);

const renderThemePreview = (themeKey: string, size?: 'sm' | 'card') => (
  <ThemeSwatch theme={themeKey} size={size} />
);
const renderPackPreview = (packKey: string, labelled?: boolean) => (
  <PackPreview pack={packKey} labelled={labelled} />
);

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
  // Watched while a Friends screen, the Focus together setup, or a lobby is
  // open: that is where statuses show.
  const friends = useFriends({
    watching:
      view === 'friends' || view === 'friend' || view === 'together' || isLobby(together.room),
  });
  useShareFocusStatus();
  useSharePresence({ share: friends.profile?.shareOnline !== false });
  const { account, signOut, deleteAccount, sync, syncNow } = useAccount();
  const away = view !== 'timer';
  const inPanel = PANEL_VIEWS.has(view);
  const boughtTiers = useBoughtTiers() ?? NO_TIERS;
  const ownedPacks = useOwnedPacks() ?? NO_PACKS;
  const earnedTiers = useEarnedTiers();

  const timer = useTimer();
  const me = account.userId;
  // So a star from a focus-together session can say who you were with, later on.
  useRememberTogetherNames(together.rooms, me);
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

  // Once you're in a room, the timer screen is where it is: the lobby takes
  // the place of Start there, then the shared countdown.
  const inRoom = together.room !== null;
  useEffect(() => {
    if (view === 'together' && inRoom) setView('timer');
  }, [view, inRoom]);

  // Start pressed while an invitation waits: ask before saying no to it.
  const [startAlone, setStartAlone] = useState<{
    invite: Room;
    resolve: (start: boolean) => void;
  } | null>(null);
  const closeStartAlone = useCallback(
    (start: boolean) => {
      startAlone?.resolve(start);
      setStartAlone(null);
    },
    [startAlone],
  );

  const hasFriends = friends.friends.length > 0;
  const { rooms, room: myRoom, invite } = together;

  // A lobby you waited in that ended without starting: said once, until dismissed.
  const [dismissedEndings, setDismissedEndings] = useState<ReadonlySet<string>>(new Set());
  const ending = myRoom === null ? lobbyEnded(rooms, me, Date.now()) : null;
  const showEnding = ending !== null && !dismissedEndings.has(ending.room.id);
  // An invitation or that note sits above the timer: tighten the spacing so
  // the footer stays in the 480×720 desktop window.
  const aboveTimer = together.invite !== null || showEnding;
  const [refocusStart, setRefocusStart] = useState(0);
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
          {hasFriends && !inRoom && (
            <button
              type="button"
              onClick={() => openView('together')}
              className="text-lavender-200 hover:text-ink-primary inline-flex min-h-6 items-center px-1 text-xs underline-offset-4 transition-colors hover:underline"
            >
              Focus with friends
            </button>
          )}
        </>
      ),
      idleOverride: () =>
        isLobby(myRoom) ? (
          <TogetherLobby
            room={myRoom}
            together={together}
            me={me}
            active={!away}
            presence={friends.presence}
          />
        ) : null,
      beforeStart: () =>
        invite === null
          ? Promise.resolve(true)
          : new Promise<boolean>((resolve) => setStartAlone({ invite, resolve })),
      running: (session) => {
        const room = roomOf(session.togetherId);
        const missed = missedStart(myRoom, me, session.togetherId, Date.now());
        return (
          <>
            {room !== null && <TogetherCompanions room={room} me={me} />}
            {missed !== null && <MissedStartNote room={missed} me={me} />}
          </>
        );
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
  }, [
    rooms,
    myRoom,
    invite,
    together,
    away,
    friends.presence,
    hasFriends,
    inRoom,
    me,
    sharedStates,
    target,
    targetState,
    setTarget,
    openView,
  ]);

  useEffect(() => {
    if (view === 'timer') return;
    const onKey = (e: KeyboardEvent) => {
      // A friend's sky goes back to the friend list; everything else to the timer.
      if (e.key === 'Escape') setView(view === 'friend' ? 'friends' : 'timer');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [view]);

  const backRef = useRef<HTMLButtonElement>(null);
  const back = (
    <BackButton
      // Re-mounted per view, so autoFocus lands on it each time.
      key={view}
      buttonRef={backRef}
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
        styleName={styleName}
      />

      <main
        inert={away}
        className={`relative z-10 flex min-h-dvh flex-col items-center px-6 transition-opacity duration-500 sm:gap-8 sm:pt-10 sm:pb-6 ${
          aboveTimer ? 'gap-4 pt-6 pb-4' : 'gap-6 pt-8 pb-6'
        } ${away ? 'pointer-events-none opacity-0' : ''}`}
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

        {showEnding && (
          <LobbyEndedNote
            ending={ending}
            onDismiss={() => {
              setDismissedEndings((was) => new Set(was).add(ending.room.id));
              // The OK button goes with the note; land on Start, not the page.
              setRefocusStart((n) => n + 1);
            }}
          />
        )}

        <section className="flex w-full flex-1 flex-col items-center justify-center">
          <TimerScreen
            slots={slots}
            sharedId={target}
            refocusStart={refocusStart}
            compact={aboveTimer}
          />
        </section>

        <footer
          className={`flex flex-col items-center justify-center sm:flex-row sm:gap-4 ${
            aboveTimer ? 'gap-2' : 'gap-3'
          }`}
        >
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
        <PanelLayer back={back} backRef={backRef}>
          <StatsView />
        </PanelLayer>
      )}

      {view === 'stardust' && (
        <PanelLayer back={back} backRef={backRef}>
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
        <PanelLayer back={back} backRef={backRef}>
          <AccountPanel
            email={account.email}
            sync={sync}
            onSyncNow={syncNow}
            onSignOut={signOut}
            onDeleteAccount={deleteAccount}
            privacySettings={<OnlineToggle friends={friends} />}
            deviceSettings={<AutostartToggle />}
          />
        </PanelLayer>
      )}

      {view === 'friends' && (
        <PanelLayer back={back} backRef={backRef}>
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
        <PanelLayer back={back} backRef={backRef}>
          <TogetherPanel
            together={together}
            friends={friends.friends}
            busy={timer.status !== 'idle'}
            focus={friends.focus}
            presence={friends.presence}
          />
        </PanelLayer>
      )}

      {view === 'friend' && friend !== null && (
        // Opaque: a Night-theme sky paints no ground of its own, so without this your
        // own timer backdrop (stars and its constellation) shows through a friend's.
        <div className="bg-night-900 fixed inset-0 z-10" data-testid="friend-sky-layer">
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

      {startAlone !== null && (
        <StartAloneDialog
          invite={startAlone.invite}
          onAnswer={together.respond}
          onClose={closeStartAlone}
        />
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

  return (
    <section className="bg-night-800/70 border-night-600 rounded-soft flex flex-col gap-3 border p-4 text-sm">
      <h3 className="text-ink-primary">This computer</h3>
      <Switch label="Launch at startup" checked={enabled} onChange={() => void toggle()} />
    </section>
  );
};
