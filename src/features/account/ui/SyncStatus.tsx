import { useEffect, useState } from 'react';

/** What the app knows about syncing, in the shape this panel shows. */
export interface SyncStatusView {
  /** `outdated`: the server needs a newer app before it syncs again. */
  phase: 'syncing' | 'synced' | 'offline' | 'unreachable' | 'outdated' | 'error';
  /** Epoch ms of the last complete sync, or null if there hasn't been one. */
  lastSyncedAt: number | null;
  /** Rows waiting to be uploaded. */
  pending: number;
  /** Rows the server refused for their content; they won't be retried. */
  rejected: number;
}

const ago = (then: number, now: number): string => {
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(then).toLocaleDateString();
};

const waiting = (n: number): string =>
  n === 0 ? '' : ` · ${n} ${n === 1 ? 'change' : 'changes'} waiting`;

/** One line about where this account's data stands, plus "Sync now". */
export const SyncStatus = ({
  status,
  onSyncNow,
}: {
  status: SyncStatusView;
  onSyncNow: () => void;
}) => {
  // Re-render each minute so "2 min ago" stays true while the panel is open.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const line =
    status.phase === 'syncing'
      ? 'Syncing…'
      : status.phase === 'offline'
        ? `Offline${waiting(status.pending)}`
        : status.phase === 'unreachable'
          ? `Couldn't reach the server${waiting(status.pending)}`
          : status.phase === 'outdated'
            ? `Please update the app to keep syncing${waiting(status.pending)}`
            : status.phase === 'error'
              ? "Couldn't sync — will try again"
              : status.lastSyncedAt === null
                ? `Not synced yet${waiting(status.pending)}`
                : `Backed up · synced ${ago(status.lastSyncedAt, now)}${waiting(status.pending)}`;

  return (
    <section className="flex flex-col items-center gap-1.5" aria-label="Sync">
      <p className="text-ink-secondary text-sm" role="status">
        {line}
      </p>
      {status.rejected > 0 && (
        <p className="text-faded text-xs">
          {status.rejected} {status.rejected === 1 ? 'item' : 'items'} couldn&rsquo;t be backed up.
          They&rsquo;re still on this device.
        </p>
      )}
      <button
        type="button"
        disabled={status.phase === 'syncing'}
        onClick={onSyncNow}
        className="text-ink-muted hover:text-ink-primary text-xs transition-colors disabled:opacity-50"
      >
        Sync now
      </button>
    </section>
  );
};
