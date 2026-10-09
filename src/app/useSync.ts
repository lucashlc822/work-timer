import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { SyncStatusView } from '@/features/account';
import { getSupabase } from '@/shared/backend';
import { db, META_KEYS, readMeta } from '@/shared/db';
import { systemClock } from '@/shared/lib';
import {
  countPending,
  createSyncEngine,
  supabaseRemote,
  webLock,
  type SyncEngine,
  type SyncOutcome,
} from '@/shared/sync';

/** Regular check-in while the app is open, for changes made on other devices. */
const PERIODIC_MS = 5 * 60_000;
/** Wait after a local change before uploading, so a burst becomes one round. */
const DEBOUNCE_MS = 2_000;
const BACKOFF_FIRST_MS = 5_000;
const BACKOFF_MAX_MS = 5 * 60_000;

type Phase = SyncStatusView['phase'];

const phaseFor = (outcome: SyncOutcome, previous: Phase): Phase => {
  if (outcome.ok) return 'synced';
  switch (outcome.reason) {
    case 'busy':
      return previous; // another window is syncing this account right now
    case 'network':
    case 'signedOut': // no usable token yet — typically offline after it expired
      return typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'unreachable';
    case 'auth':
      return 'unreachable';
    default:
      return 'error';
  }
};

/**
 * Keeps this account's local store in step with the server, for the main
 * window only (the mini window never mounts this).
 *
 * Triggers: start, the window becoming visible, the connection coming back,
 * a short pause after any new local change, and every five minutes. After a
 * failure it retries on its own with a growing wait (5 s doubling to 5 min),
 * and any of the triggers above still gets a round in sooner.
 */
export const useSync = (): SyncStatusView & { syncNow: () => void } => {
  const [engine] = useState<SyncEngine | null>(() => {
    const client = getSupabase();
    return client === null
      ? null
      : createSyncEngine({
          db,
          remote: supabaseRemote(client),
          clock: systemClock,
          lock: webLock(),
        });
  });

  const [phase, setPhase] = useState<Phase>('syncing');
  const phaseRef = useRef<Phase>('syncing');
  const failures = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const counts = useLiveQuery(() => countPending(db), [], { pending: 0, rejected: 0 });
  const lastSyncedAt = useLiveQuery(
    async () => (await readMeta<number>(db, META_KEYS.lastSyncedAt)) ?? null,
    [],
    null,
  );

  const run = useCallback(async () => {
    if (engine === null) return;
    if (retryTimer.current !== null) clearTimeout(retryTimer.current);
    retryTimer.current = null;

    setPhase('syncing');
    let outcome: SyncOutcome;
    try {
      outcome = await engine.syncNow();
    } catch (e) {
      console.error('Sync failed', e);
      outcome = { ok: false, reason: 'server' };
    }

    const next = phaseFor(outcome, phaseRef.current === 'syncing' ? 'synced' : phaseRef.current);
    phaseRef.current = next;
    setPhase(next);

    if (outcome.ok || outcome.reason === 'busy') {
      failures.current = 0;
      return;
    }
    const wait = Math.min(BACKOFF_MAX_MS, BACKOFF_FIRST_MS * 2 ** failures.current);
    failures.current += 1;
    retryTimer.current = setTimeout(() => void run(), wait);
  }, [engine]);

  // Start, visibility, connectivity, and the periodic check-in.
  useEffect(() => {
    if (engine === null) return;
    void run();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void run();
    };
    const onOnline = () => void run();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    const periodic = setInterval(() => void run(), PERIODIC_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      clearInterval(periodic);
      if (retryTimer.current !== null) clearTimeout(retryTimer.current);
    };
  }, [engine, run]);

  // Upload soon after something new is waiting (a session finished, a tag edited).
  useEffect(() => {
    if (engine === null || counts.pending === 0) return;
    const timer = setTimeout(() => void run(), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [engine, counts.pending, run]);

  return {
    phase: engine === null ? 'error' : phase,
    lastSyncedAt,
    pending: counts.pending,
    rejected: counts.rejected,
    syncNow: () => void run(),
  };
};
