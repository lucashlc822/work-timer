import { useEffect, useState, type ReactNode } from 'react';

import { AuthScreens, deleteAccount, signOut, type SignedInAccount } from '@/features/account';
import { clearLastUserId, getSupabase, readStoredAccount, writeLastUserId } from '@/shared/backend';
import { APP_NAME } from '@/shared/config';
import { bindAccountDb, db, deleteAccountDb } from '@/shared/db';

import { AccountContext } from './accountContext';
import { useSync } from './useSync';

/**
 * Nothing in the app runs until someone is signed in.
 *
 * Decided once per window load, from local storage only, so a device that is
 * offline with an expired token still opens straight into its account (see
 * `shared/backend/session`). Signing in binds that account's local store and
 * renders the app without a reload; signing out reloads the window, so no live
 * query or timer can hold on to the previous account's data.
 */

type Gate =
  { kind: 'unconfigured' } | { kind: 'signedOut' } | { kind: 'signedIn'; account: SignedInAccount };

let startup: Gate | undefined;

/** Read once per window: StrictMode's double render must not bind two stores. */
const decideStartup = (): Gate => {
  if (startup !== undefined) return startup;
  if (getSupabase() === null) {
    startup = { kind: 'unconfigured' };
  } else {
    const stored = readStoredAccount();
    if (stored !== null) {
      bindAccountDb(stored.userId);
      startup = { kind: 'signedIn', account: stored };
    } else {
      clearLastUserId();
      startup = { kind: 'signedOut' };
    }
  }
  return startup;
};

const reload = () => window.location.reload();

export const AuthGate = ({ children }: { children: ReactNode }) => {
  const [gate, setGate] = useState<Gate>(decideStartup);

  // If the server ends the session (signed out elsewhere, account deleted),
  // follow it: forget this device's sign-in and go back to the sign-in screen.
  useEffect(() => {
    const client = getSupabase();
    if (client === null || gate.kind !== 'signedIn') return;
    const { data } = client.auth.onAuthStateChange((event) => {
      // Deleting the account signs out too, but must finish removing the local
      // copy before the window reloads.
      if (event === 'SIGNED_OUT' && !deleting) {
        clearLastUserId();
        reload();
      }
    });
    return () => data.subscription.unsubscribe();
  }, [gate.kind]);

  if (gate.kind === 'unconfigured') {
    return (
      <main className="relative z-10 flex min-h-dvh flex-col items-center justify-center gap-2 px-6 text-center">
        <h1 className="text-ink-primary text-lg">{APP_NAME}</h1>
        <p className="text-ink-secondary max-w-sm text-sm">
          This build isn&rsquo;t connected to a server, so it can&rsquo;t sign anyone in. If you are
          developing the app, see <code>.env.example</code>.
        </p>
      </main>
    );
  }

  if (gate.kind === 'signedOut') {
    return (
      <AuthScreens
        onSignedIn={(account) => {
          writeLastUserId(account.userId);
          bindAccountDb(account.userId);
          setGate({ kind: 'signedIn', account });
        }}
      />
    );
  }

  return (
    <SignedIn
      account={gate.account}
      signOut={async () => {
        const client = getSupabase();
        if (client !== null) await signOut(client);
        clearLastUserId();
        reload();
      }}
      deleteAccount={() => deleteEverywhere(gate.account.userId)}
    >
      {children}
    </SignedIn>
  );
};

/**
 * Delete the account on the server, then this device's copy, then go back to
 * the sign-in screen. If the server refuses, nothing local is touched and the
 * error reaches the panel. Once the server has deleted it, every later step is
 * best effort: the account is gone either way, so the person must not be left
 * signed in to it.
 */
let deleting = false;

const deleteEverywhere = async (userId: string): Promise<void> => {
  const client = getSupabase();
  if (client === null) throw new Error('No server configured');
  await deleteAccount(client);
  deleting = true;

  // The server session went with the account; this clears the stored one.
  await signOut(client).catch((e: unknown) => console.warn('Local sign-out after delete', e));
  clearLastUserId();
  // Close this window's connection first, or the deletion waits on it. Other
  // windows (the mini window) close theirs when Dexie asks them to.
  db.close();
  await deleteAccountDb(userId).catch((e: unknown) =>
    console.error('Could not delete the local copy', e),
  );
  reload();
};

/** The signed-in app, with sync running for the whole time it is mounted. */
const SignedIn = ({
  account,
  signOut,
  deleteAccount,
  children,
}: {
  account: SignedInAccount;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  children: ReactNode;
}) => {
  const { syncNow, ...sync } = useSync(account.userId);
  return (
    <AccountContext.Provider value={{ account, signOut, deleteAccount, sync, syncNow }}>
      {children}
    </AccountContext.Provider>
  );
};
