import { createContext, useContext } from 'react';

import type { SignedInAccount, SyncStatusView } from '@/features/account';

/** The signed-in account, for anything rendered inside `AuthGate`. */
export interface AccountContextValue {
  account: SignedInAccount;
  signOut: () => Promise<void>;
  /** Rejects, having changed nothing, if the server didn't delete the account. */
  deleteAccount: () => Promise<void>;
  sync: SyncStatusView;
  syncNow: () => void;
}

export const AccountContext = createContext<AccountContextValue | null>(null);

export const useAccount = (): AccountContextValue => {
  const value = useContext(AccountContext);
  if (value === null) throw new Error('useAccount outside AuthGate');
  return value;
};
