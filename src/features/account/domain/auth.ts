/**
 * Account rules and wording, with no network in sight.
 *
 * The same checks run before anything is sent, so an obviously wrong email or
 * a short password is caught instantly; the server enforces them again.
 */

export const MIN_PASSWORD_LENGTH = 8;
export const CODE_LENGTH = 6;

/** Deliberately loose: something@something.something. The server is the real judge. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizeEmail = (raw: string): string => raw.trim().toLowerCase();

export const isPlausibleEmail = (raw: string): boolean => EMAIL_SHAPE.test(normalizeEmail(raw));

export const isLongEnoughPassword = (password: string): boolean =>
  password.length >= MIN_PASSWORD_LENGTH;

/** Keeps digits only, so a pasted "123 456" or "123-456" still works. */
export const normalizeCode = (raw: string): string => raw.replace(/\D/g, '').slice(0, CODE_LENGTH);

export const isCompleteCode = (raw: string): boolean => normalizeCode(raw).length === CODE_LENGTH;

/**
 * Every way an account action can fail that the person needs to hear about.
 * Anything the app can't name becomes `unknown`.
 */
export type AuthErrorKind =
  | 'notInvited'
  | 'wrongCredentials'
  | 'emailNotConfirmed'
  | 'badCode'
  | 'weakPassword'
  | 'rateLimited'
  | 'offline'
  | 'unknown';

export const AUTH_MESSAGES: Record<AuthErrorKind, string> = {
  notInvited: "This email hasn't been invited yet. Ask the person who shared the app with you.",
  wrongCredentials: "That email and password don't match.",
  emailNotConfirmed: 'Confirm your email first — we sent you a code.',
  badCode: "That code didn't work. Check it, or send a new one.",
  weakPassword: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
  rateLimited: 'Too many tries for now. Wait a minute and try again.',
  offline: "Couldn't reach the server. Check your connection and try again.",
  unknown: 'Something went wrong. Try again in a moment.',
};

/** The shape of the errors Supabase Auth returns; only what classification needs. */
export interface AuthErrorLike {
  name?: string;
  message?: string;
  status?: number;
  code?: string;
}

/**
 * Turn a Supabase Auth error into one of the kinds above.
 *
 * The invite check is a database trigger, and Supabase Auth reports any
 * database refusal during sign-up as "Database error saving new user", so that
 * message is how a sign-up from an uninvited address is recognised.
 *
 * "Offline" means no answer arrived at all (status 0) or a gateway in between
 * failed (502–504). supabase-js labels every HTTP 500 `AuthRetryableFetchError`
 * too — including the invite refusal — so that name alone proves nothing.
 */
export const classifyAuthError = (error: AuthErrorLike): AuthErrorKind => {
  const code = error.code ?? '';
  const message = (error.message ?? '').toLowerCase();
  const status = error.status;

  if (message.includes('database error saving new user')) return 'notInvited';
  if (status === 0 || status === undefined || (status >= 502 && status <= 504)) {
    if (error.name === 'AuthRetryableFetchError' || status !== undefined) return 'offline';
  }
  if (code === 'invalid_credentials' || message.includes('invalid login credentials')) {
    return 'wrongCredentials';
  }
  if (code === 'email_not_confirmed' || message.includes('email not confirmed')) {
    return 'emailNotConfirmed';
  }
  if (code === 'otp_expired' || code === 'otp_disabled' || message.includes('token has expired')) {
    return 'badCode';
  }
  if (code === 'weak_password') return 'weakPassword';
  if (code.startsWith('over_') || error.status === 429) return 'rateLimited';
  return 'unknown';
};
