import { useRef, useState, type FormEvent, type ReactNode } from 'react';

import { FriendsFailure, type FriendRow } from '../data/friendsRepository';
import { formatCode, normalizeCode } from '../domain/code';
import { FRIENDS_MESSAGES } from '../domain/errors';
import { statusLine } from '../domain/focusStatus';
import { lastFocusLabel } from '../domain/lastFocus';
import type { Friends } from '../hooks/useFriends';
import type { DescribeShared } from '../domain/shared';
import type { Shared } from '../hooks/useShared';

/** Shared constellation proposals (M7 phase 5), shown with friend requests. */
export interface SharedRequestsProps {
  shared: Shared;
  me: string;
  describe: DescribeShared;
}

const CARD = 'bg-night-800/70 border-night-600 flex flex-col gap-3 rounded-soft border p-4 text-sm';
const INPUT =
  'bg-night-900 border-night-600 text-ink-primary w-full rounded-soft border px-3 py-2 text-sm';
const BUTTON =
  'rounded-pill border-night-600 text-ink-secondary hover:border-lavender-400 hover:text-ink-primary shrink-0 border px-4 py-1.5 text-xs transition-colors disabled:pointer-events-none disabled:opacity-50';
const LINK = 'text-ink-muted hover:text-ink-primary text-xs transition-colors';

const messageOf = (e: unknown): string =>
  FRIENDS_MESSAGES[e instanceof FriendsFailure ? e.kind : 'unknown'];

const nameOf = (row: FriendRow): string => row.displayName ?? 'Someone';

const Alert = ({ children }: { children: ReactNode }) => (
  <p role="alert" className="text-faded text-xs">
    {children}
  </p>
);

/**
 * Friends (M7): your name and code, adding a friend by their code, requests,
 * and your friends. Opening a friend shows their sky, which `app/` draws.
 */
export const FriendsPanel = ({
  friends,
  now,
  onOpenFriend,
  shared,
}: {
  friends: Friends;
  now: number;
  onOpenFriend: (friend: FriendRow) => void;
  shared?: SharedRequestsProps;
}) => {
  const { load, profile } = friends;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-6 pt-10 pb-32">
      <header className="flex flex-col items-center gap-1">
        <h2 className="text-ink-secondary text-sm tracking-widest uppercase">Friends</h2>
      </header>

      {load === 'loading' && profile === null && (
        <p className="text-ink-muted text-center text-sm">Loading…</p>
      )}

      {(load === 'offline' || load === 'error') && (
        <section className="flex flex-col items-center gap-2 text-center">
          <p className="text-ink-secondary text-sm">
            {FRIENDS_MESSAGES[load === 'offline' ? 'offline' : 'unknown']}
          </p>
          <button type="button" className={BUTTON} onClick={() => void friends.refresh()}>
            Try again
          </button>
        </section>
      )}

      {profile !== null && (
        <>
          <NameCard name={profile.displayName} onSave={friends.saveName} />
          <CodeCard code={profile.friendCode} />
          <AddFriend hasName={profile.displayName !== null} onSend={friends.sendRequest} />
          <Requests friends={friends} shared={shared} />
          <FriendList friends={friends} now={now} onOpen={onOpenFriend} />
        </>
      )}
    </div>
  );
};

const NameCard = ({
  name,
  onSave,
}: {
  name: string | null;
  onSave: (name: string) => Promise<void>;
}) => {
  const [editing, setEditing] = useState(name === null);
  const [typed, setTyped] = useState(name ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave(typed);
      setEditing(false);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSaving(false);
    }
  };

  if (!editing && name !== null) {
    return (
      <section className={CARD}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-ink-muted text-xs">Your name</span>
            <span className="text-ink-primary text-base">{name}</span>
          </div>
          <button
            type="button"
            className={LINK}
            onClick={() => {
              setTyped(name);
              setEditing(true);
            }}
          >
            Edit
          </button>
        </div>
      </section>
    );
  }

  return (
    <form className={CARD} onSubmit={(e) => void save(e)}>
      <label className="flex flex-col gap-1.5">
        <span className="text-ink-primary">
          {name === null ? 'Pick a name your friends will see' : 'Your name'}
        </span>
        <div className="flex gap-2">
          <input
            className={INPUT}
            value={typed}
            maxLength={40}
            autoComplete="nickname"
            onChange={(e) => setTyped(e.target.value)}
          />
          <button type="submit" className={BUTTON} disabled={saving || typed.trim() === ''}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </label>
      {error !== null && <Alert>{error}</Alert>}
    </form>
  );
};

const CodeCard = ({ code }: { code: string }) => {
  const shown = formatCode(code);
  const [copied, setCopied] = useState<'no' | 'yes' | 'manual'>('no');
  const codeRef = useRef<HTMLSpanElement>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shown);
      setCopied('yes');
    } catch {
      // No clipboard here (a non-secure origin, a refused permission): select
      // the code so a keyboard copy takes it.
      const el = codeRef.current;
      const selection = window.getSelection();
      if (el !== null && selection !== null) {
        const range = document.createRange();
        range.selectNodeContents(el);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      setCopied('manual');
    }
  };

  return (
    <section className={CARD}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-ink-muted text-xs">Your friend code</span>
          <span
            ref={codeRef}
            data-testid="friend-code"
            className="text-ink-primary font-mono text-xl tracking-widest select-all"
          >
            {shown}
          </span>
        </div>
        <button type="button" className={BUTTON} onClick={() => void copy()}>
          {copied === 'yes' ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="text-ink-muted text-xs" aria-live="polite">
        {copied === 'manual'
          ? 'Press Ctrl+C to copy the selected code.'
          : 'Give this to a friend so they can add you.'}
      </p>
    </section>
  );
};

const AddFriend = ({ hasName, onSend }: { hasName: boolean; onSend: Friends['sendRequest'] }) => {
  const [typed, setTyped] = useState('');
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    setNote(null);
    setError(null);
    const code = normalizeCode(typed);
    if (code === null) {
      setError(FRIENDS_MESSAGES.codeNotFound);
      return;
    }
    setSending(true);
    try {
      const { outcome, name } = await onSend(code);
      const who = name ?? 'them';
      setNote(
        outcome === 'accepted' ? `You're now friends with ${who}.` : `Request sent to ${who}.`,
      );
      setTyped('');
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <form className={CARD} onSubmit={(e) => void send(e)}>
      <label className="flex flex-col gap-1.5">
        <span className="text-ink-primary">Add a friend</span>
        <div className="flex gap-2">
          <input
            className={`${INPUT} font-mono tracking-widest uppercase`}
            value={typed}
            placeholder="ABC-DEF"
            maxLength={12}
            autoComplete="off"
            spellCheck={false}
            disabled={!hasName}
            onChange={(e) => setTyped(e.target.value)}
          />
          <button
            type="submit"
            className={BUTTON}
            disabled={!hasName || sending || typed.trim() === ''}
          >
            {sending ? 'Sending…' : 'Send request'}
          </button>
        </div>
      </label>
      {!hasName && <p className="text-ink-muted text-xs">Pick your name first.</p>}
      {note !== null && (
        <p className="text-success text-xs" role="status">
          {note}
        </p>
      )}
      {error !== null && <Alert>{error}</Alert>}
    </form>
  );
};

/** Runs an action and shows its failure inline; the list re-reads either way. */
const useAction = () => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
};

const Requests = ({
  friends,
  shared,
}: {
  friends: Friends;
  shared: SharedRequestsProps | undefined;
}) => {
  const { busy, error, run } = useAction();
  const proposals = (shared?.shared.rows ?? []).filter((r) => r.acceptedAt === null);
  const incomingShared = proposals.filter((r) => r.proposedBy !== shared?.me);
  const outgoingShared = proposals.filter((r) => r.proposedBy === shared?.me);
  if (friends.incoming.length === 0 && friends.outgoing.length === 0 && proposals.length === 0) {
    return null;
  }
  const partner = (name: string | null) => name ?? 'Someone';

  return (
    <section className={CARD} aria-labelledby="friend-requests">
      <h3 id="friend-requests" className="text-ink-primary">
        Requests
      </h3>
      <ul className="flex flex-col gap-2">
        {friends.incoming.map((r) => (
          <li key={r.friendshipId} className="flex items-center justify-between gap-2">
            <span className="text-ink-secondary">{nameOf(r)} wants to be friends</span>
            <span className="flex gap-2">
              <button
                type="button"
                className={BUTTON}
                disabled={busy}
                onClick={() => void run(() => friends.respond(r.friendshipId, true))}
              >
                Accept
              </button>
              <button
                type="button"
                className={BUTTON}
                disabled={busy}
                onClick={() => void run(() => friends.respond(r.friendshipId, false))}
              >
                Decline
              </button>
            </span>
          </li>
        ))}
        {friends.outgoing.map((r) => (
          <li key={r.friendshipId} className="flex items-center justify-between gap-2">
            <span className="text-ink-secondary">Waiting for {nameOf(r)}</span>
            <button
              type="button"
              className={BUTTON}
              disabled={busy}
              onClick={() => void run(() => friends.remove(r.friendshipId))}
            >
              Cancel
            </button>
          </li>
        ))}
        {shared !== undefined &&
          incomingShared.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2">
              <span className="text-ink-secondary">
                {partner(r.partnerName)} wants to build {shared.describe(r).name} with you
              </span>
              <span className="flex gap-2">
                <button
                  type="button"
                  className={BUTTON}
                  disabled={busy}
                  aria-label={`Accept ${shared.describe(r).name} with ${partner(r.partnerName)}`}
                  onClick={() => void run(() => shared.shared.respond(r.id, true))}
                >
                  Accept
                </button>
                <button
                  type="button"
                  className={BUTTON}
                  disabled={busy}
                  aria-label={`Decline ${shared.describe(r).name} with ${partner(r.partnerName)}`}
                  onClick={() => void run(() => shared.shared.respond(r.id, false))}
                >
                  Decline
                </button>
              </span>
            </li>
          ))}
        {shared !== undefined &&
          outgoingShared.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2">
              <span className="text-ink-secondary">
                Waiting for {partner(r.partnerName)} to build {shared.describe(r).name}
              </span>
              <button
                type="button"
                className={BUTTON}
                disabled={busy}
                aria-label={`Withdraw ${shared.describe(r).name}`}
                onClick={() => void run(() => shared.shared.stop(r.id))}
              >
                Withdraw
              </button>
            </li>
          ))}
      </ul>
      {error !== null && <Alert>{error}</Alert>}
    </section>
  );
};

const FriendList = ({
  friends,
  now,
  onOpen,
}: {
  friends: Friends;
  now: number;
  onOpen: (friend: FriendRow) => void;
}) => {
  const { busy, error, run } = useAction();
  const [confirming, setConfirming] = useState<string | null>(null);

  return (
    <section className={CARD} aria-labelledby="friend-list">
      <h3 id="friend-list" className="text-ink-primary">
        Friends
      </h3>
      {friends.friends.length === 0 ? (
        <p className="text-ink-secondary">No friends yet. Share your code, or add theirs.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {friends.friends.map((f) =>
            confirming === f.friendshipId ? (
              <li key={f.friendshipId} className="flex flex-col gap-2 py-1">
                <span className="text-ink-secondary">
                  Remove {nameOf(f)}? You&rsquo;ll stop seeing each other&rsquo;s skies.
                </span>
                <span className="flex gap-2">
                  <button
                    type="button"
                    className={BUTTON}
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await friends.remove(f.friendshipId);
                        setConfirming(null);
                      })
                    }
                  >
                    Remove
                  </button>
                  <button type="button" className={BUTTON} onClick={() => setConfirming(null)}>
                    Keep
                  </button>
                </span>
              </li>
            ) : (
              <li key={f.friendshipId} className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onOpen(f)}
                  className="hover:bg-night-700/60 rounded-soft flex flex-1 flex-col items-start px-2 py-1.5 text-left transition-colors"
                >
                  <span className="text-ink-primary">{nameOf(f)}</span>
                  <span className="text-ink-muted text-xs">
                    {statusLine(friends.focus.get(f.friendId) ?? null, now) ??
                      lastFocusLabel(f.lastFocusAt, now)}
                  </span>
                </button>
                <button
                  type="button"
                  className={LINK}
                  aria-label={`Remove ${nameOf(f)}`}
                  onClick={() => setConfirming(f.friendshipId)}
                >
                  Remove
                </button>
              </li>
            ),
          )}
        </ul>
      )}
      {error !== null && <Alert>{error}</Alert>}
    </section>
  );
};
