import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';

import { APP_VERSION } from '@/shared/config';
import { db, hasWorkInFlight } from '@/shared/db';

import { SyncStatus, type SyncStatusView } from './SyncStatus';

interface Props {
  email: string | null;
  sync: SyncStatusView;
  onSyncNow: () => void;
  onSignOut: () => Promise<void>;
  /** Deletes the account everywhere it can; rejects if nothing was removed. */
  onDeleteAccount: () => Promise<void>;
}

/** Whether this device has a session or Pomodoro run in progress. */
const useBusy = (): boolean => useLiveQuery(() => hasWorkInFlight(db), [], false);

/**
 * The outcome of the last finished sync attempt. A round someone is waiting
 * on ("Sync now") reads "Syncing…" while it runs; whether the server can be
 * reached is still what the last attempt found, not unknown.
 */
const useSettledPhase = (phase: SyncStatusView['phase']): SyncStatusView['phase'] => {
  const [settled, setSettled] = useState(phase);
  useEffect(() => {
    if (phase !== 'syncing') setSettled(phase);
  }, [phase]);
  return settled;
};

/** Who is signed in, what is stored about them, signing out, and leaving for good. */
export const AccountPanel = ({ email, sync, onSyncNow, onSignOut, onDeleteAccount }: Props) => {
  const busy = useBusy();
  const settled = useSettledPhase(sync.phase);
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

      <section className="bg-night-800/70 border-night-600 rounded-soft flex flex-col gap-2 border p-4 text-sm">
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

      <DeleteAccount
        email={email}
        busy={busy}
        // Only once an attempt has actually reached the server (it may still
        // have said "please update"); before the first one, it's unknown.
        offline={settled !== 'synced' && settled !== 'outdated'}
        onDelete={onDeleteAccount}
      />

      {/* What to quote when asking for help, and what an update changes. */}
      <p className="text-ink-muted text-center text-xs">Starkeep {APP_VERSION}</p>
    </div>
  );
};

/**
 * Deleting is permanent and reaches the server, so it is tucked behind a
 * button, asks for the account's email to be typed out, and is only offered
 * when it can actually finish: online, with nothing in progress.
 */
const DeleteAccount = ({
  email,
  busy,
  offline,
  onDelete,
}: {
  email: string | null;
  busy: boolean;
  offline: boolean;
  onDelete: () => Promise<void>;
}) => {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmed = email !== null && typed.trim().toLowerCase() === email.toLowerCase();
  const blocked = busy
    ? 'Finish or end the session in progress before deleting your account.'
    : offline
      ? 'Deleting your account needs a connection to the server.'
      : null;

  const remove = async () => {
    setDeleting(true);
    setError(null);
    try {
      await onDelete();
    } catch (e) {
      console.error('Account deletion failed', e);
      setError("Couldn't delete your account. Nothing was removed.");
      setDeleting(false);
    }
  };

  if (!open) {
    return (
      <section className="flex flex-col items-center">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-ink-muted hover:text-faded text-xs transition-colors"
        >
          Delete account…
        </button>
      </section>
    );
  }

  return (
    <section
      aria-label="Delete account"
      className="border-faded/40 rounded-soft flex flex-col gap-3 border p-4 text-sm"
    >
      <h3 className="text-ink-primary">Delete account</h3>
      <p className="text-ink-secondary">
        This permanently removes your account and everything backed up under it — sessions, stars,
        constellation choices, tags and settings — and this device&rsquo;s copy too. It can&rsquo;t
        be undone.
      </p>
      <p className="text-ink-secondary">
        Any other device signed in to this account is signed out the next time it reaches the
        server; what it already holds stays on it. You could sign up again later with the same
        address.
      </p>
      <label className="text-ink-secondary flex flex-col gap-1 text-xs">
        Type your email address to confirm
        <input
          type="email"
          autoComplete="off"
          value={typed}
          disabled={deleting}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={email ?? ''}
          className="bg-night-900 border-night-600 text-ink-primary rounded-soft border px-3 py-2 text-sm"
        />
      </label>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          disabled={deleting}
          onClick={() => {
            setOpen(false);
            setTyped('');
            setError(null);
          }}
          className="text-ink-muted hover:text-ink-primary text-xs transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!confirmed || blocked !== null || deleting}
          onClick={() => void remove()}
          className="rounded-pill border-faded text-faded hover:bg-faded/10 border px-4 py-1.5 text-xs transition-colors disabled:pointer-events-none disabled:opacity-40"
        >
          {deleting ? 'Deleting…' : 'Delete my account'}
        </button>
      </div>
      {blocked !== null && <p className="text-ink-muted text-xs">{blocked}</p>}
      {error !== null && (
        <p role="alert" className="text-faded text-xs">
          {error}
        </p>
      )}
    </section>
  );
};
