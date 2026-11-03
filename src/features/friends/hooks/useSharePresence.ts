import { useEffect, useRef, useState } from 'react';

import { getSupabase } from '@/shared/backend';

import { clearPresence, setPresence } from '../data/friendsRepository';
import type { PresenceState } from '../domain/presence';

/** How often an open app says it's still here. The server forgets it after three minutes. */
export const PRESENCE_BEAT_MS = 60_000;

/** No pointer or keyboard input for this long reads as Away, even in view. */
export const PRESENCE_IDLE_MS = 10 * 60_000;

const INPUT_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel'] as const;

/**
 * Shares Online / Away with friends (M7 presence): Online while the window is
 * in view and in use, Away while it is hidden, minimised, in the tray, or
 * untouched for `PRESENCE_IDLE_MS`.
 *
 * Sends on every change and every `PRESENCE_BEAT_MS`, and best-effort clears
 * it when the page goes away; if that clear never arrives (a crash, no
 * network), the server stops showing it after three minutes anyway.
 *
 * `share` is "Show when I'm online": off sends nothing. The server ignores
 * presence from someone who opted out too, so a device that hasn't heard yet
 * can't undo it. Best effort and silent, like `useShareFocusStatus`: a failed
 * send waits for the next beat, change, or the connection coming back.
 */
export const useSharePresence = ({ share }: { share: boolean }): void => {
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible');
  const [idle, setIdle] = useState(false);
  const [beat, setBeat] = useState(0);
  const lastInput = useRef(Date.now());
  const sharing = useRef(share);
  sharing.current = share;

  useEffect(() => {
    const onVisibility = () => setVisible(document.visibilityState === 'visible');
    const onOnline = () => setBeat((n) => n + 1);
    const onInput = () => {
      lastInput.current = Date.now();
      setIdle(false);
    };
    const onPageHide = () => {
      const client = getSupabase();
      if (sharing.current && client !== null) void clearPresence(client).catch(() => undefined);
    };
    const timer = window.setInterval(() => {
      setIdle(Date.now() - lastInput.current >= PRESENCE_IDLE_MS);
      setBeat((n) => n + 1);
    }, PRESENCE_BEAT_MS);

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    window.addEventListener('pagehide', onPageHide);
    for (const e of INPUT_EVENTS) window.addEventListener(e, onInput, { passive: true });
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('pagehide', onPageHide);
      for (const e of INPUT_EVENTS) window.removeEventListener(e, onInput);
    };
  }, []);

  const state: PresenceState = visible && !idle ? 'online' : 'away';
  useEffect(() => {
    if (!share) return;
    const client = getSupabase();
    if (client === null) return;
    // Offline or refused: left for the next beat or change.
    void setPresence(client, state).catch(() => undefined);
  }, [share, state, beat]);
};
