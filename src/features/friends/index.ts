/**
 * Public entrypoint of the friends feature (M7) — the only module `app/` may
 * import. Friends' data comes from the server's friends functions and is kept
 * in memory only, never in this device's store.
 */
export { FriendsPanel } from './ui/FriendsPanel';
export { FriendsPill } from './ui/FriendsPill';
export { FriendSkyView } from './ui/FriendSkyView';
export type { FriendSummary } from './ui/FriendSkyView';
export { FOCUS_POLL_MS, useFriends } from './hooks/useFriends';
export { useShareFocusStatus } from './hooks/useShareFocusStatus';
export type { Friends } from './hooks/useFriends';
export type { FriendRow } from './data/friendsRepository';
export type { FriendChoice, FriendSession, FriendSky } from './domain/friendSky';
export { TogetherPanel } from './ui/TogetherPanel';
export {
  InviteBanner,
  TogetherCancelNote,
  TogetherLine,
  TogetherResultNote,
} from './ui/TogetherNotes';
export { useTogether } from './hooks/useTogether';
export type { Together } from './hooks/useTogether';
export { useTogetherWins } from './hooks/useTogetherWins';
export { friendCancel, shouldAutoStart } from './domain/room';
export type { Room } from './domain/room';
export { useShared } from './hooks/useShared';
export type { Shared } from './hooks/useShared';
export { incomingProposals } from './domain/shared';
export type {
  DescribeShared,
  SharedDraft,
  SharedProgress,
  SharedRow,
  SharedSession,
} from './domain/shared';
export { SharedWithFriend } from './ui/SharedWithFriend';
