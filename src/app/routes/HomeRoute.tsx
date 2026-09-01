import { useEffect, useState } from 'react';

import { APP_NAME, APP_TAGLINE } from '@/shared/config';
import { db, getLocalUserId } from '@/shared/db';
import { getRuntime, type Runtime } from '@/shared/runtime';

/**
 * M0.5 placeholder.
 *
 * The foundation milestones deliver a shell, not a timer. This screen exists
 * to make that shell verifiable by hand: it proves the design tokens render,
 * the local database opens and writes, and — the point of this milestone —
 * that the runtime capability layer reports honestly in both hosts, with the
 * native buttons actually doing something in the desktop app and degrading
 * silently in a browser. M1 replaces it with the timer.
 */
export const HomeRoute = () => {
  const [localUserId, setLocalUserId] = useState<string | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [autostartOn, setAutostartOn] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    getLocalUserId(db)
      .then((id) => {
        if (!cancelled) setLocalUserId(id);
      })
      .catch((error: unknown) => {
        if (!cancelled) setDbError(error instanceof Error ? error.message : String(error));
      });

    void getRuntime().then(async (host) => {
      if (cancelled) return;
      setRuntime(host);
      const enabled = await host.autostart.isEnabled();
      if (!cancelled) setAutostartOn(enabled);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const toggleAutostart = async () => {
    if (runtime === null) return;
    const next = !(autostartOn ?? false);
    await runtime.autostart.setEnabled(next);
    setAutostartOn(await runtime.autostart.isEnabled());
  };

  const testNotification = async () => {
    if (runtime === null) return;
    await runtime.notifications.requestPermission();
    await runtime.notifications.notify({
      title: APP_NAME,
      body: 'Notifications are working.',
    });
  };

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 p-8 text-center">
      <div className="relative flex h-40 w-40 items-center justify-center">
        {/* Static stand-in for the generated sky that arrives in M2. */}
        <div
          aria-hidden="true"
          className="bg-lavender-400/25 absolute inset-0 rounded-full blur-3xl"
        />
        <img src="/favicon.svg" alt="" width={96} height={96} className="relative" />
      </div>

      <div className="space-y-2">
        <h1 className="text-ink-primary text-2xl font-medium tracking-wide">{APP_NAME}</h1>
        <p className="text-ink-secondary max-w-xs text-sm">
          {APP_TAGLINE} The timer arrives in the next milestone.
        </p>
      </div>

      <dl className="rounded-soft border-night-700 bg-night-800/60 w-full max-w-xs space-y-1 border p-4 text-left text-xs">
        <Diagnostic label="Runtime" value={runtime?.kind ?? 'resolving…'} />
        <Diagnostic label="Tray" value={supportLabel(runtime?.tray.isSupported)} />
        <Diagnostic label="Mini window" value={supportLabel(runtime?.miniWindow.isSupported)} />
        <Diagnostic
          label="Notifications"
          value={supportLabel(runtime?.notifications.isSupported)}
        />
        <Diagnostic
          label="Launch at startup"
          value={
            runtime?.autostart.isSupported === true
              ? (autostartOn ?? false)
                ? 'on'
                : 'off'
              : 'unavailable'
          }
        />
        <Diagnostic
          label="Local store"
          value={dbError ?? (localUserId === null ? 'opening…' : 'ready')}
        />
      </dl>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <SmallButton onClick={() => void testNotification()}>Test notification</SmallButton>
        {runtime?.miniWindow.isSupported === true && (
          <SmallButton onClick={() => void runtime.miniWindow.open()}>Open mini window</SmallButton>
        )}
        {runtime?.autostart.isSupported === true && (
          <SmallButton onClick={() => void toggleAutostart()}>
            {(autostartOn ?? false) ? 'Disable' : 'Enable'} autostart
          </SmallButton>
        )}
      </div>
    </main>
  );
};

const supportLabel = (supported: boolean | undefined): string =>
  supported === undefined ? '…' : supported ? 'available' : 'unavailable';

const Diagnostic = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-baseline justify-between gap-4">
    <dt className="text-ink-muted">{label}</dt>
    <dd className="text-ink-secondary font-mono">{value}</dd>
  </div>
);

const SmallButton = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    className="rounded-pill border-night-600 text-ink-secondary hover:border-lavender-400 hover:text-ink-primary border px-4 py-1.5 text-xs transition-colors"
  >
    {children}
  </button>
);
