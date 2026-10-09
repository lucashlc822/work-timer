import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The one Supabase client for this window.
 *
 * Null when the build has no server configured (a fresh clone, CI, or a
 * misconfigured release); the app then shows a plain "not connected" screen
 * instead of failing somewhere deeper.
 *
 * The session is kept in `localStorage` under a fixed key, so the app can tell
 * who is signed in by reading it locally — no network — which is what lets the
 * timer open offline with an expired token (see `readStoredSession`).
 */

export const AUTH_STORAGE_KEY = 'work-timer-auth';

let client: SupabaseClient | null | undefined;

export const getSupabase = (): SupabaseClient | null => {
  if (client !== undefined) return client;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  client =
    url && key
      ? createClient(url, key, {
          auth: {
            storageKey: AUTH_STORAGE_KEY,
            persistSession: true,
            autoRefreshToken: true,
            // Codes, never links: there is never a session in the URL to pick up.
            detectSessionInUrl: false,
          },
        })
      : null;
  return client;
};
