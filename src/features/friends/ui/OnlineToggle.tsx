import { useState } from 'react';

import { Switch } from '@/shared/ui';

import { FriendsFailure } from '../data/friendsRepository';
import { FRIENDS_MESSAGES } from '../domain/errors';
import type { Friends } from '../hooks/useFriends';

/**
 * "Show when I'm online" (M7 presence), for the Account panel. On by default;
 * off, friends see you as Offline unless you're focusing or on a break. Shows
 * nothing until the profile has loaded, so it never flips under the pointer.
 */
export const OnlineToggle = ({ friends }: { friends: Friends }) => {
  // The answer the server hasn't confirmed yet, shown meanwhile.
  const [pending, setPending] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (friends.profile === null) return null;

  const change = async (share: boolean) => {
    setPending(share);
    setError(null);
    try {
      await friends.saveShareOnline(share);
    } catch (e) {
      setError(FRIENDS_MESSAGES[e instanceof FriendsFailure ? e.kind : 'unknown']);
    } finally {
      setPending(null);
    }
  };

  return (
    <section className="bg-night-800/70 border-night-600 rounded-soft flex flex-col gap-3 border p-4 text-sm">
      <h3 className="text-ink-primary">Friends</h3>
      <Switch
        label="Show when I’m online"
        checked={pending ?? friends.profile.shareOnline}
        disabled={pending !== null}
        onChange={(share) => void change(share)}
      />
      <p className="text-ink-muted text-xs">
        Friends see Online or Away while the app is open. Focusing is always shared.
      </p>
      {error !== null && (
        <p role="alert" className="text-faded text-xs">
          {error}
        </p>
      )}
    </section>
  );
};
