import { useEffect, useState, type ReactNode } from 'react';

import { AuthScreens, signOut, type SignedInAccount } from '@/features/account';
import { clearLastUserId, getSupabase, readStoredAccount, writeLastUserId } from '@/shared/backend';
import { APP_NAME } from '@/shared/config';
import { bindAccountDb } from '@/shared/db';

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
      if (event === 'SIGNED_OUT') {
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
    >
      {children}
    </SignedIn>
  );
};

/** The signed-in app, with sync running for the whole time it is mounted. */
const SignedIn = ({
  account,
  signOut,
  children,
}: {
  account: SignedInAccount;
  signOut: () => Promise<void>;
  children: ReactNode;
}) => {
  const { syncNow, ...sync } = useSync();
  return (
    <AccountContext.Provider value={{ account, signOut, sync, syncNow }}>
      {children}
    </AccountContext.Provider>
  );
};
