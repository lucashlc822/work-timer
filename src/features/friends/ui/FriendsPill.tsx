/** The footer button; shows how many friend requests are waiting for you. */
export const FriendsPill = ({ waiting, onOpen }: { waiting: number; onOpen: () => void }) => (
  <button
    type="button"
    onClick={onOpen}
    aria-label={
      waiting === 0
        ? 'Friends'
        : `Friends, ${waiting} ${waiting === 1 ? 'request' : 'requests'} waiting`
    }
    className="rounded-pill text-ink-secondary hover:text-ink-primary hover:bg-night-800/60 px-3 py-1.5 text-xs transition-colors"
  >
    Friends
    {waiting > 0 && <span className="text-lavender-300"> · {waiting}</span>}
  </button>
);
