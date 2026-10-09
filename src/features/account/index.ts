/**
 * Public entrypoint of the account feature — the only module `app/` may import.
 */
export { AuthScreens } from './ui/AuthScreens';
export { AccountPanel } from './ui/AccountPanel';
export type { SyncStatusView } from './ui/SyncStatus';
export { signOut } from './data/authRepository';
export type { SignedInAccount } from './data/authRepository';
