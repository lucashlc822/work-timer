import { useEffect, useState } from 'react';

import { TimerScreen } from '@/features/timer';
import { APP_NAME } from '@/shared/config';
import { getRuntime, type AutostartPort } from '@/shared/runtime';
import { StarMark } from '@/shared/ui';

/**
 * The main window: the timer, with the app's few settings underneath.
 *
 * Replaces the M0.5 diagnostics screen. The autostart toggle is kept — it was
 * the only place that setting could be changed — until a settings surface
 * exists to hold it.
 */
export const HomeRoute = () => (
  <main className="flex min-h-dvh flex-col items-center gap-8 px-6 pt-10 pb-6">
    <header className="flex items-center gap-2">
      <StarMark size={28} />
      <h1 className="text-ink-secondary text-sm tracking-widest uppercase">{APP_NAME}</h1>
    </header>

    <section className="flex w-full flex-1 flex-col items-center justify-center">
      <TimerScreen />
    </section>

    <footer>
      <AutostartToggle />
    </footer>
  </main>
);

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
