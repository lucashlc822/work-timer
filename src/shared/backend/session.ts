import { AUTH_STORAGE_KEY } from './supabase';

/**
 * Who is signed in on this device, read without the network.
 *
 * Two facts, both in `localStorage`:
 * - `lastUserId`, written by the app on sign-in and removed on sign-out. It is
 *   the app's own record that an account is signed in here.
 * - Supabase's stored session, which carries the same user id and the email.
 *
 * The app treats the device as signed in when both agree. Neither read needs
 * a valid token, so an expired session while offline still opens that
 * account's timer; Supabase refreshes the token once it can, and if the server
 * finally refuses it (account deleted, signed out elsewhere) the app signs out
 * then. Every access is wrapped: storage can be unavailable (private windows,
 * blocked site data), and that must read as "signed out", never crash.
 */

const LAST_USER_KEY = 'work-timer-last-user';

export interface StoredAccount {
  userId: string;
  email: string | null;
}

const read = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

export const writeLastUserId = (userId: string): void => {
  try {
    window.localStorage.setItem(LAST_USER_KEY, userId);
  } catch {
    // Storage blocked: the app still works this launch, it just won't remember.
  }
};

export const clearLastUserId = (): void => {
  try {
    window.localStorage.removeItem(LAST_USER_KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
};

/** The signed-in account per local storage alone, or null. */
export const readStoredAccount = (): StoredAccount | null => {
  const userId = read(LAST_USER_KEY);
  if (userId === null) return null;

  const raw = read(AUTH_STORAGE_KEY);
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as { user?: { id?: unknown; email?: unknown } };
    if (parsed.user?.id !== userId) return null;
    return { userId, email: typeof parsed.user.email === 'string' ? parsed.user.email : null };
  } catch {
    return null;
  }
};

/** Only the app's own record, for the mini window, which never talks to the server. */
export const readLastUserId = (): string | null => read(LAST_USER_KEY);
