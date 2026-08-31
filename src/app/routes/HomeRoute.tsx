import { useEffect, useState } from 'react';

import { db, getLocalUserId } from '@/shared/db';
import { defaultAbandonmentPolicy, describeDevice, isStandalone } from '@/shared/lib';

/**
 * M0 placeholder.
 *
 * The foundation milestone's deliverable is an installable, offline-capable
 * shell — not a timer. This screen exists to make that shell verifiable by
 * hand: it proves the design tokens render, the local database opens and
 * writes, and the platform detection that will drive the abandonment policy
 * reports sensibly on each target. M1 replaces it with the timer.
 */
export const HomeRoute = () => {
  const [localUserId, setLocalUserId] = useState<string | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getLocalUserId(db)
      .then((id) => {
        if (!cancelled) setLocalUserId(id);
      })
      .catch((error: unknown) => {
        if (!cancelled) setDbError(error instanceof Error ? error.message : String(error));
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
        <h1 className="text-ink-primary text-2xl font-medium tracking-wide">Work Timer</h1>
        <p className="text-ink-secondary max-w-xs text-sm">
          Every session you finish becomes a star. The timer arrives in the next milestone.
        </p>
      </div>

      <dl className="rounded-soft border-night-700 bg-night-800/60 w-full max-w-xs space-y-1 border p-4 text-left text-xs">
        <Diagnostic label="Display mode" value={isStandalone() ? 'installed' : 'browser tab'} />
        <Diagnostic label="Device" value={describeDevice()} />
        <Diagnostic label="Default policy" value={defaultAbandonmentPolicy()} />
        <Diagnostic
          label="Local store"
          value={dbError ?? (localUserId === null ? 'opening…' : 'ready')}
        />
      </dl>
    </main>
  );
};

const Diagnostic = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-baseline justify-between gap-4">
    <dt className="text-ink-muted">{label}</dt>
    <dd className="text-ink-secondary font-mono">{value}</dd>
  </div>
);
