import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';

import { db, META_KEYS, readMeta } from '@/shared/db';

import { SyncStatus, type SyncStatusView } from './SyncStatus';

interface Props {
  email: string | null;
  sync: SyncStatusView;
  onSyncNow: () => void;
  onSignOut: () => Promise<void>;
}

/**
 * Whether this device has a session or Pomodoro run in progress. Read from the
 * meta pointers the timer keeps, so the account feature never reaches into
 * the timer's internals.
 */
const useBusy = (): boolean =>
  useLiveQuery(
    async () =>
      (await readMeta<string>(db, META_KEYS.activeSessionId)) !== undefined ||
      (await readMeta<unknown>(db, META_KEYS.activeRun)) !== undefined,
    [],
    false,
  );

/** Who is signed in, what is stored about them, and signing out. */
export const AccountPanel = ({ email, sync, onSyncNow, onSignOut }: Props) => {
  const busy = useBusy();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signOut = async () => {
    setSigningOut(true);
    setError(null);
    try {
      await onSignOut();
    } catch (e) {
      console.error('Sign-out failed', e);
      setError("Couldn't sign out. Try again.");
      setSigningOut(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-6 pt-10 pb-28">
      <header className="flex flex-col items-center gap-1">
        <h2 className="text-ink-secondary text-sm tracking-widest uppercase">Account</h2>
        <p className="text-ink-primary text-base">{email ?? 'Signed in'}</p>
      </header>

      <SyncStatus status={sync} onSyncNow={onSyncNow} />

      <section className="bg-night-800/70 border-night-600 flex flex-col gap-2 rounded-xl border p-4 text-sm">
        <h3 className="text-ink-primary">About your data</h3>
        <p className="text-ink-secondary">
          Your sessions, constellation choices, tag names and settings are kept on this device and
          backed up to the app&rsquo;s server under your account, along with your email address.
        </p>
        <p className="text-ink-secondary">
          Through the app, only you can see them. The person who runs the server can technically see
          what is stored there.
        </p>
      </section>

      <section className="flex flex-col items-center gap-2">
        <button
          type="button"
          disabled={busy || signingOut}
          onClick={() => void signOut()}
          className="rounded-pill border-night-600 text-ink-secondary hover:border-lavender-400 hover:text-ink-primary border px-5 py-2 text-sm transition-colors disabled:pointer-events-none disabled:opacity-50"
        >
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
        {busy && (
          <p className="text-ink-muted text-center text-xs">
            Finish or end the session in progress before signing out.
          </p>
        )}
        {!busy && (
          <p className="text-ink-muted text-center text-xs">
            Your history stays on this device and comes back when you sign in again.
          </p>
        )}
        {error !== null && (
          <p role="alert" className="text-faded text-xs">
            {error}
          </p>
        )}
      </section>
    </div>
  );
};
