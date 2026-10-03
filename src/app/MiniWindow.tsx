import { MiniCountdown } from '@/features/timer';
import { APP_NAME } from '@/shared/config';

/**
 * The always-on-top mini timer.
 *
 * Rendered as a *surface*, not a route: it is a separate OS window, reached by
 * `?window=mini` rather than a path. That also sidesteps a real trap — in a
 * production Tauri build the frontend is served over a custom asset protocol
 * that does not fall back to `index.html` for unknown paths, so a client-side
 * route like `/mini` would 404 in the packaged app while working perfectly in
 * dev.
 *
 * Read-only by design: cancelling is a deliberate act and belongs behind the
 * main window's confirmation, not on a 240px floating panel.
 */
export const MiniWindow = () => {
  const close = async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().close();
  };

  return (
    <div
      // Frameless window: this region substitutes for the missing title bar.
      data-tauri-drag-region
      className="bg-night-800 border-night-600 flex h-dvh w-dvw cursor-grab flex-col items-center justify-center gap-2 border"
    >
      <p data-tauri-drag-region className="text-ink-muted text-[10px] tracking-widest uppercase">
        {APP_NAME}
      </p>
      <MiniCountdown />
      <button
        type="button"
        onClick={() => void close()}
        className="text-ink-muted hover:text-ink-secondary absolute top-1 right-2 text-xs transition-colors"
        aria-label="Close mini timer"
      >
        ×
      </button>
    </div>
  );
};
