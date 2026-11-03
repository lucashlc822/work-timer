import type { FriendStatus } from '../domain/presence';

/**
 * A small dot beside a friend's status line. Decoration only: the line next
 * to it always says the same thing in words, so colour is never the signal.
 * Away is the Online colour as a ring, so the two read as one family.
 */
const LOOK: Record<FriendStatus, string> = {
  focusing: 'bg-lavender-400',
  break: 'bg-lavender-200',
  online: 'bg-mint-400',
  away: 'border border-mint-400',
  offline: 'bg-ink-muted/50',
};

export const StatusDot = ({ status }: { status: FriendStatus }) => (
  <span
    aria-hidden
    data-status={status}
    className={`rounded-pill inline-block h-2 w-2 shrink-0 ${LOOK[status]}`}
  />
);
