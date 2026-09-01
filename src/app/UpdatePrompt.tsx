import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Offers a new version rather than installing one.
 *
 * The service worker is registered with `registerType: 'prompt'` on purpose: an
 * auto-updating worker can activate and reload the page at any moment, and
 * doing that 70 minutes into a 90-minute session would destroy the exact thing
 * the app exists to protect. The update waits until the user says so.
 */
export const UpdatePrompt = () => {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      className="rounded-soft border-night-600 bg-night-800/95 fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-sm items-center gap-3 border p-3 backdrop-blur"
    >
      <p className="text-ink-secondary flex-1 text-sm">A new version is ready.</p>
      <button
        type="button"
        onClick={() => setNeedRefresh(false)}
        className="rounded-pill text-ink-muted hover:text-ink-secondary px-3 py-1.5 text-sm transition-colors"
      >
        Later
      </button>
      <button
        type="button"
        onClick={() => void updateServiceWorker(true)}
        className="rounded-pill bg-lavender-400 text-night-900 hover:bg-lavender-300 px-3 py-1.5 text-sm transition-colors"
      >
        Update
      </button>
    </div>
  );
};
