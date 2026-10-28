import type { SyncStatusView } from '@/features/account';
import type { SyncOutcome } from '@/shared/sync';

export type Phase = SyncStatusView['phase'];

/** Whether the browser says there is no connection at all. */
export const isOffline = (): boolean => typeof navigator !== 'undefined' && !navigator.onLine;

/**
 * What a finished round says about syncing. `previous` is the last settled
 * phase, kept when another window is syncing this account right now.
 */
export const phaseFor = (
  outcome: SyncOutcome,
  previous: Phase,
  offline: boolean = isOffline(),
): Phase => {
  if (outcome.ok) return 'synced';
  switch (outcome.reason) {
    case 'busy':
      return previous;
    case 'network':
    case 'signedOut': // no usable token yet — typically offline after it expired
      return offline ? 'offline' : 'unreachable';
    case 'auth':
      return 'unreachable';
    case 'outdated':
      return 'outdated';
    default:
      return 'error';
  }
};

/**
 * Whether a round that is about to start should read "Syncing…".
 *
 * Only the first round (nothing has settled yet, so there is nothing truer to
 * show) and one someone is waiting on: "Sync now", or the connection coming
 * back (`awaited`). Background rounds and retries keep the last settled line,
 * so a server that stays down reads "Couldn't reach the server" steadily
 * instead of flickering with "Syncing…" on every retry.
 */
export const showsSyncing = (awaited: boolean, settled: Phase | null): boolean =>
  awaited || settled === null;
