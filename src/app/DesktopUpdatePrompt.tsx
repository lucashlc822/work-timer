import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';

import { APP_NAME } from '@/shared/config';
import { db, hasWorkInFlight, isAccountDbBound } from '@/shared/db';
import { getRuntime, type AvailableUpdate, type UpdaterPort } from '@/shared/runtime';

/** First look shortly after launch, so a freshly opened app isn't kept waiting. */
export const FIRST_CHECK_MS = 10_000;
/** The app sits in the tray for days, so it keeps looking while it is open. */
export const CHECK_EVERY_MS = 6 * 60 * 60_000;

const defaultGetUpdater = async (): Promise<UpdaterPort> => (await getRuntime()).updater;

interface Props {
  /** Test seam: where the updater comes from. */
  getUpdater?: () => Promise<UpdaterPort>;
  /**
   * Whether to look for updates at all. Production builds only: a dev build
   * would otherwise be offered the published release it is a copy of.
   */
  enabled?: boolean;
  firstCheckMs?: number;
  everyMs?: number;
}

/**
 * Tells the person a newer desktop build is ready, and installs it on request.
 *
 * Deliberately a notice and not an automatic install, for the same reason the
 * web build's service worker is `registerType: 'prompt'`: an update that
 * relaunches the app 70 minutes into a 90-minute session would destroy the
 * thing the app exists to protect. So the notice never shows while a session or
 * Pomodoro run is in progress; it appears when the person is between sessions
 * (or still on the sign-in screen) and waits there until they choose.
 *
 * Desktop main window only; the web build has `UpdatePrompt`.
 */
export const DesktopUpdatePrompt = ({
  getUpdater = defaultGetUpdater,
  enabled = import.meta.env.PROD,
  firstCheckMs = FIRST_CHECK_MS,
  everyMs = CHECK_EVERY_MS,
}: Props) => {
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'installing' | 'failed'>('idle');

  const bound = useAccountBound();
  // `undefined` until the first read: treated as busy, so the notice can never
  // flash up during a session at launch.
  const busy = useLiveQuery(() => (bound ? hasWorkInFlight(db) : false), [bound]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const look = async () => {
      const updater = await getUpdater();
      if (!updater.isSupported) return;
      const found = await updater.check();
      // Keep the first one found: it is what the person may be about to install.
      if (!cancelled && found !== null) setUpdate((current) => current ?? found);
    };

    const first = setTimeout(() => void look(), firstCheckMs);
    const regular = setInterval(() => void look(), everyMs);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(regular);
    };
  }, [enabled, getUpdater, firstCheckMs, everyMs]);

  if (update === null || dismissed || busy !== false) return null;

  const install = async () => {
    setPhase('installing');
    try {
      await update.install(); // relaunches on success, so there is nothing after this
    } catch (error) {
      console.error('Update failed', error);
      setPhase('failed');
    }
  };

  const installing = phase === 'installing';

  return (
    <div
      role="status"
      className="rounded-soft border-night-600 bg-night-800/95 fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-sm items-center gap-3 border p-3 backdrop-blur"
    >
      <p className="text-ink-secondary flex-1 text-sm">
        {installing
          ? 'Updating…'
          : phase === 'failed'
            ? "Couldn't update. Try again later."
            : `${APP_NAME} ${update.version} is ready.`}
      </p>
      <button
        type="button"
        disabled={installing}
        onClick={() => setDismissed(true)}
        className="rounded-pill text-ink-muted hover:text-ink-secondary px-3 py-1.5 text-sm transition-colors disabled:opacity-50"
      >
        Later
      </button>
      <button
        type="button"
        disabled={installing}
        onClick={() => void install()}
        className="rounded-pill bg-lavender-400 text-night-900 hover:bg-lavender-300 px-3 py-1.5 text-sm transition-colors disabled:opacity-50"
      >
        Restart to update
      </button>
    </div>
  );
};

/**
 * Whether an account's local store is open yet. On the sign-in screen it isn't,
 * and reading `db` there would throw; it becomes true once, at sign-in, so a
 * cheap check until then is enough (the window reloads on sign-out).
 */
const useAccountBound = (): boolean => {
  const [bound, setBound] = useState(isAccountDbBound);

  useEffect(() => {
    if (bound) return;
    const timer = setInterval(() => {
      if (isAccountDbBound()) setBound(true);
    }, 1_000);
    return () => clearInterval(timer);
  }, [bound]);

  return bound;
};
