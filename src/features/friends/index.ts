/**
 * Public entrypoint of the friends feature (M7) — the only module `app/` may
 * import. Friends' data comes from the server's friends functions and is kept
 * in memory only, never in this device's store.
 */
export { FriendsPanel } from './ui/FriendsPanel';
export { FriendsPill } from './ui/FriendsPill';
export { FriendSkyView } from './ui/FriendSkyView';
export type { FriendSummary } from './ui/FriendSkyView';
export { useFriends } from './hooks/useFriends';
export { useShareFocusStatus } from './hooks/useShareFocusStatus';
export type { Friends } from './hooks/useFriends';
export type { FriendRow } from './data/friendsRepository';
export type { FriendChoice, FriendSession, FriendSky } from './domain/friendSky';
