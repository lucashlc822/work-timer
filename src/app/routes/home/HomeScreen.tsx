import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  activeShared,
  ConstellationStatus,
  installDevTools,
  SharedPicker,
  SharedStartHint,
  SkyBackdrop,
  StartHint,
  TargetPicker,
  useEarnedTiers,
  PackPreview,
  StylePreview,
  ThemeSwatch,
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
  type FriendRow,
  type Room,
  type Together,
} from '@/features/friends';
import {
  StardustPanel,
  StardustPill,
  styleName,
  useBoughtTiers,
  useOwnedPacks,
} from '@/features/progression';
import { StatsView, installStatsDevTools } from '@/features/stats';
import { TimerScreen, useTimer, type TimerSlots } from '@/features/timer';
import { clearMeta, db, META_KEYS, readMeta, writeMeta } from '@/shared/db';
import { useFocusIfLost, useMediaQuery } from '@/shared/ui';

import { useAccount } from '../../accountContext';
import {
  escapeGoesHome,
  initialPage,
  inProgress,
  pageOnStatusChange,
  type Page,
} from '../../navigation';
import { renderFriendSky, summarizeFriend } from '../../friendSlots';
import { useSharedSky } from '../../sharedSkyContext';
import { useRememberTogetherNames } from '../../togetherNames';
import { useTogetherTimer } from '../../useTogetherTimer';

import {
  BackButton,
  DeviceSettings,
  NAV_BUTTON,
  NO_PACKS,
  NO_TIERS,
  PANEL_VIEWS,
  PanelLayer,
  SkyLink,
} from './panels';
import { Brand, HomePage, TimerTopBar } from './pages';
import { timerSlots } from './timerSlots';

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

/** An open dialog or popover, or focus in a text field: Escape is theirs. */
const escapeBelongsElsewhere = (): boolean => {
  if (document.querySelector('[role="dialog"], [role="alertdialog"], [aria-modal="true"]') !== null)
    return true;
  const el = document.activeElement;
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    (el instanceof HTMLElement && el.isContentEditable)
  );
};

/** An overlay over the page, or 'none'. */
type View = 'none' | 'sky' | 'stats' | 'stardust' | 'account' | 'friends' | 'friend' | 'together';

export const HomeScreen = ({ together }: { together: Together }) => {
  const [view, setView] = useState<View>('none');
  // The timer-screen control that opened the current panel. The timer screen
  // stays mounted (inert) underneath, so closing the panel can hand focus back
  // to it instead of letting it fall to the page with the Back button.
  const opener = useRef<HTMLElement | null>(null);
  const openView = useCallback((next: View) => {
    if (document.activeElement instanceof HTMLElement) opener.current = document.activeElement;
    setView(next);
  }, []);
  useFocusIfLost(opener, view === 'none');
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
  const away = view !== 'none';
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
  // Behind the timer: the session on screen (running, or its result) shows the
  // constellation it was for, its own when that's null; only with no session
  // does the next session's target show.
  const focusId = timer.session !== null ? timer.session.sharedId : target;

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
    if (view === 'together' && inRoom) setView('none');
  }, [view, inRoom]);

  // Home or the timer page (navigation.ts has the rules). Null until the timer
  // has read the store, so a launch mid-session never shows home first.
  const [page, setPage] = useState<Page | null>(null);
  const lastStatus = useRef(timer.status);
  useEffect(() => {
    const prev = lastStatus.current;
    lastStatus.current = timer.status;
    setPage((p) =>
      p === null ? initialPage(timer.status, inRoom) : pageOnStatusChange(p, prev, timer.status),
    );
  }, [timer.status, inRoom]);
  // Joining a room (or one starting) takes you to the timer page, where the lobby is.
  useEffect(() => {
    if (inRoom) setPage((p) => (p === null ? p : 'timer'));
  }, [inRoom]);

  // Focus on a page change: the timer page's title, or home's call to action.
  // Not on launch (nothing was focused), and not when a page change finds focus
  // already inside the new page.
  const timerHeading = useRef<HTMLHeadingElement>(null);
  const cta = useRef<HTMLButtonElement>(null);
  const shownPage = useRef<Page | null>(null);
  useEffect(() => {
    const was = shownPage.current;
    shownPage.current = page;
    if (was === null || page === null || was === page) return;
    const lost = document.activeElement === null || document.activeElement === document.body;
    if (page === 'home') cta.current?.focus();
    else if (lost) timerHeading.current?.focus();
  }, [page]);

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
  // everything stays in the 480×720 desktop window.
  // A short window (the desktop app's 560 px minimum) tightens the same way.
  const shortWindow = useMediaQuery('(max-height: 640px)');
  const aboveTimer = together.invite !== null || showEnding || shortWindow;
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
            active={!away && page === 'timer'}
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
      // The sky opens over the result; Back lands on this button again.
      resultActions: () => <SkyLink onOpen={() => openView('sky')} />,
      resultNote: (result, moment) => (
        <>
          {timerSlots.resultNote?.(result, moment)}
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
    page,
  ]);

  // Bubble phase on the document, on purpose: a card's or popover's own Escape
  // handler stops the event first (CLAUDE.md, the Stardust shop decision).
  const status = timer.status;
  useEffect(() => {
    // Whether this press belongs to a dialog, popover or text field, read before
    // any handler runs: a popover's own document listener can close it, and
    // React re-render, before this one is reached.
    let elsewhere = false;
    const snapshot = (e: KeyboardEvent) => {
      if (e.key === 'Escape') elsewhere = escapeBelongsElsewhere();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (view !== 'none') {
        // A friend's sky goes back to the friend list; everything else to its page.
        setView(view === 'friend' ? 'friends' : 'none');
        return;
      }
      // An open dialog or popover closes itself on this same press; a text field
      // keeps its Escape. Only a press with nothing else to do goes home.
      if (elsewhere) return;
      if (page !== null && escapeGoesHome(page, status, inRoom)) setPage('home');
    };
    window.addEventListener('keydown', snapshot, true);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', snapshot, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [view, page, status, inRoom]);

  const backRef = useRef<HTMLButtonElement>(null);
  const back = (
    <BackButton
      // Re-mounted per view, so autoFocus lands on it each time.
      key={view}
      buttonRef={backRef}
      label={
        view === 'friend' ? 'Back to friends' : `Back to ${page === 'home' ? 'home' : 'timer'}`
      }
      floating={!inPanel}
      onClick={() => {
        if (view === 'friend') void friends.refresh();
        setView(view === 'friend' ? 'friends' : 'none');
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

      {page !== null && (
        <main
          inert={away}
          className={`relative z-10 flex min-h-dvh flex-col items-center px-6 transition-opacity duration-500 sm:gap-8 sm:pt-10 sm:pb-6 ${
            aboveTimer ? 'gap-4 pt-6 pb-4' : 'gap-6 pt-8 pb-6'
          } ${away ? 'pointer-events-none opacity-0' : ''}`}
        >
          {page === 'home' ? (
            <Brand />
          ) : (
            <TimerTopBar onHome={() => setPage('home')} headingRef={timerHeading} />
          )}

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

          {/* Kept mounted on home (hidden): the timer's own state and moments wait there. */}
          <section
            hidden={page !== 'timer'}
            className="flex w-full flex-1 flex-col items-center justify-center"
          >
            <TimerScreen
              slots={slots}
              sharedId={target}
              refocusStart={refocusStart}
              compact={aboveTimer}
              present={!away && page === 'timer'}
            />
          </section>

          {page === 'home' && (
            <HomePage
              busy={inProgress(timer.status) || inRoom}
              ctaRef={cta}
              onFocus={() => setPage('timer')}
              footer={
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
                  <nav
                    aria-label="Main"
                    className="flex flex-wrap items-center justify-center gap-1"
                  >
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
                    <button
                      type="button"
                      onClick={() => openView('account')}
                      className={NAV_BUTTON}
                    >
                      Account
                    </button>
                  </nav>
                </footer>
              }
            />
          )}
        </main>
      )}

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
            deviceSettings={<DeviceSettings />}
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
