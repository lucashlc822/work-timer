import { useEffect, useState } from 'react';

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
  ProgressLine,
  RewardNote,
  StardustPanel,
  StardustPill,
  useBoughtTiers,
  useOwnedPacks,
} from '@/features/progression';
import { StatsView, installStatsDevTools } from '@/features/stats';
import { TagPicker } from '@/features/tags';
import { TimerScreen, type TimerSlots } from '@/features/timer';
import { APP_NAME } from '@/shared/config';
import { getRuntime, type AutostartPort } from '@/shared/runtime';
import { StarMark } from '@/shared/ui';

import { useAccount } from '../accountContext';

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
  const [view, setView] = useState<'timer' | 'sky' | 'stats' | 'stardust' | 'account'>('timer');
  const { account, signOut, deleteAccount, sync, syncNow } = useAccount();
  const away = view !== 'timer';
  const boughtTiers = useBoughtTiers() ?? NO_TIERS;
  const ownedPacks = useOwnedPacks() ?? NO_PACKS;
  const earnedTiers = useEarnedTiers();

  useEffect(installDevTools, []);
  useEffect(installStatsDevTools, []);

  useEffect(() => {
    if (view === 'timer') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setView('timer');
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

        <section className="flex w-full flex-1 flex-col items-center justify-center pt-24">
          <TimerScreen slots={timerSlots} />
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

      {away && (
        <button
          type="button"
          autoFocus
          onClick={() => setView('timer')}
          className="rounded-pill bg-night-800/80 border-night-600 text-ink-secondary hover:text-ink-primary fixed bottom-6 left-1/2 z-20 -translate-x-1/2 border px-5 py-2 text-xs backdrop-blur transition-colors"
        >
          Back to timer
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
