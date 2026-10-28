import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { SyncStatusView } from '@/features/account';
import { getSupabase } from '@/shared/backend';
import { APP_VERSION } from '@/shared/config';
import { db, META_KEYS, readMeta } from '@/shared/db';
import { systemClock } from '@/shared/lib';
import {
  countPending,
  createSyncEngine,
  supabaseRemote,
  webLock,
  type RemoteStore,
  type SyncEngine,
  type SyncOutcome,
} from '@/shared/sync';

import { isOffline, phaseFor, showsSyncing, type Phase } from './syncPhase';

/** Regular check-in while the app is open, for changes made on other devices. */
const PERIODIC_MS = 5 * 60_000;
/** Wait after a local change before uploading, so a burst becomes one round. */
const DEBOUNCE_MS = 2_000;
/** Wait after another device's change is announced, so a burst becomes one round. */
const LIVE_DEBOUNCE_MS = 500;
const BACKOFF_FIRST_MS = 5_000;
const BACKOFF_MAX_MS = 5 * 60_000;

/**
 * Keeps this account's local store in step with the server, for the main
 * window only (the mini window never mounts this).
 *
 * Triggers: start, the window becoming visible, the connection coming back,
 * a short pause after any new local change, another of the account's devices
 * changing something (announced live by the server), and every five minutes.
 * After a failure it retries on its own with a growing wait (5 s doubling to
 * 5 min), and any of the triggers above still gets a round in sooner. That
 * includes "Please update": once the server's minimum is lowered again, sync
 * resumes on the next retry.
 *
 * The line says what is true as soon as it is known: no connection reads
 * "Offline" at once, without waiting for a request to fail (an expired sign-in
 * can hold one for ~30 s), and "Syncing…" is shown only for the first round and
 * for one someone is waiting on ("Sync now", the connection coming back) —
 * background rounds and retries keep the last settled line.
 */
export const useSync = (userId: string): SyncStatusView & { syncNow: () => void } => {
  const [{ engine, remote }] = useState<{
    engine: SyncEngine | null;
    remote: RemoteStore | null;
  }>(() => {
    const client = getSupabase();
    if (client === null) return { engine: null, remote: null };
    const remote = supabaseRemote(client);
    return {
      remote,
      engine: createSyncEngine({
        db,
        remote,
        clock: systemClock,
        lock: webLock(),
        appVersion: APP_VERSION,
      }),
    };
  });

  const [phase, setPhase] = useState<Phase>('syncing');
  // The last finished outcome; null until the first round settles.
  const settledRef = useRef<Phase | null>(null);
  const failures = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const counts = useLiveQuery(() => countPending(db), [], { pending: 0, rejected: 0 });
  const lastSyncedAt = useLiveQuery(
    async () => (await readMeta<number>(db, META_KEYS.lastSyncedAt)) ?? null,
    [],
    null,
  );

  const settle = useCallback((next: Phase) => {
    settledRef.current = next;
    setPhase(next);
  }, []);

  const run = useCallback(
    async (awaited = false) => {
      if (engine === null) return;
      if (retryTimer.current !== null) clearTimeout(retryTimer.current);
      retryTimer.current = null;

      // Known offline: say so now. The `online` event brings the next round.
      if (isOffline()) {
        settle('offline');
        return;
      }

      if (showsSyncing(awaited, settledRef.current)) setPhase('syncing');
      let outcome: SyncOutcome;
      try {
        outcome = await engine.syncNow();
      } catch (e) {
        console.error('Sync failed', e);
        outcome = { ok: false, reason: 'server' };
      }

      settle(phaseFor(outcome, settledRef.current ?? 'synced'));

      if (outcome.ok || outcome.reason === 'busy') {
        failures.current = 0;
        return;
      }
      const wait = Math.min(BACKOFF_MAX_MS, BACKOFF_FIRST_MS * 2 ** failures.current);
      failures.current += 1;
      retryTimer.current = setTimeout(() => void run(), wait);
    },
    [engine, settle],
  );

  // Start, visibility, connectivity, and the periodic check-in.
  useEffect(() => {
    if (engine === null) return;
    void run();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void run();
    };
    const onOnline = () => void run(true);
    const onOffline = () => settle('offline');
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const periodic = setInterval(() => void run(), PERIODIC_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      clearInterval(periodic);
      if (retryTimer.current !== null) clearTimeout(retryTimer.current);
    };
  }, [engine, run, settle]);

  // Another device changed something: fetch it now rather than at the next check-in.
  useEffect(() => {
    if (remote === null) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const stop = remote.subscribe(userId, () => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => void run(), LIVE_DEBOUNCE_MS);
    });
    return () => {
      stop();
      if (timer !== null) clearTimeout(timer);
    };
  }, [remote, userId, run]);

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
    syncNow: () => void run(true),
  };
};
