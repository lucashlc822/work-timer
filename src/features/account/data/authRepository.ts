import type { Session, SupabaseClient } from '@supabase/supabase-js';

import {
  classifyAuthError,
  normalizeCode,
  normalizeEmail,
  type AuthErrorKind,
  type AuthErrorLike,
} from '../domain/auth';

/**
 * Every account action, over Supabase Auth.
 *
 * Email and password; the address is confirmed, and a forgotten password is
 * reset, by a 6-digit code typed into the app. No step ever needs a link or a
 * browser redirect, so the desktop app and the web version behave the same.
 *
 * Each function resolves on success and rejects with `AuthFailure` otherwise,
 * so screens only ever deal with the named kinds in `domain/auth`.
 */

export class AuthFailure extends Error {
  readonly kind: AuthErrorKind;

  constructor(kind: AuthErrorKind, cause?: unknown) {
    super(`Auth failed: ${kind}`, { cause });
    this.kind = kind;
    this.name = 'AuthFailure';
  }
}

export interface SignedInAccount {
  userId: string;
  email: string | null;
}

const fail = (error: unknown): never => {
  throw new AuthFailure(classifyAuthError(error as AuthErrorLike), error);
};

/** Network errors reject rather than resolve with `{ error }`; both end up here. */
const call = async <R extends { error: unknown }>(run: () => Promise<R>): Promise<R> => {
  let result: R;
  try {
    result = await run();
  } catch (e) {
    return fail(e);
  }
  if (result.error) return fail(result.error);
  return result;
};

const accountOf = (session: Session | null): SignedInAccount => {
  if (session === null) throw new AuthFailure('unknown');
  return { userId: session.user.id, email: session.user.email ?? null };
};

/**
 * Create an account. Supabase emails a confirmation code; nothing is signed in
 * until `confirmSignUp`. For an address that already has an account, Supabase
 * deliberately answers the same way (so nobody can probe who has signed up),
 * and no code arrives — the screen says to sign in instead in that case.
 */
export const signUp = async (client: SupabaseClient, email: string, password: string) => {
  await call(() => client.auth.signUp({ email: normalizeEmail(email), password }));
};

export const confirmSignUp = async (
  client: SupabaseClient,
  email: string,
  code: string,
): Promise<SignedInAccount> => {
  const { data } = await call(() =>
    client.auth.verifyOtp({
      email: normalizeEmail(email),
      token: normalizeCode(code),
      type: 'signup',
    }),
  );
  return accountOf(data.session);
};

export const resendSignUpCode = async (client: SupabaseClient, email: string) => {
  await call(() => client.auth.resend({ type: 'signup', email: normalizeEmail(email) }));
};

export const signIn = async (
  client: SupabaseClient,
  email: string,
  password: string,
): Promise<SignedInAccount> => {
  const { data } = await call(() =>
    client.auth.signInWithPassword({ email: normalizeEmail(email), password }),
  );
  return accountOf(data.session);
};

/** Emails a reset code. Answers the same whether or not the address has an account. */
export const requestPasswordReset = async (client: SupabaseClient, email: string) => {
  await call(() => client.auth.resetPasswordForEmail(normalizeEmail(email)));
};

/** Checks the reset code (which signs in), then sets the new password. */
export const resetPassword = async (
  client: SupabaseClient,
  email: string,
  code: string,
  newPassword: string,
): Promise<SignedInAccount> => {
  const { data } = await call(() =>
    client.auth.verifyOtp({
      email: normalizeEmail(email),
      token: normalizeCode(code),
      type: 'recovery',
    }),
  );
  const account = accountOf(data.session);
  await call(() => client.auth.updateUser({ password: newPassword }));
  return account;
};

/** Signs out this device only; the person's other devices stay signed in. */
export const signOut = async (client: SupabaseClient) => {
  await call(() => client.auth.signOut({ scope: 'local' }));
};

/**
 * Deletes the signed-in account on the server, with everything stored under
 * it (`delete_my_account()`; every table cascades). The invite is kept, so
 * the same address could sign up again. Removing this device's copy is the
 * caller's job, once this has succeeded.
 */
export const deleteAccount = async (client: SupabaseClient) => {
  // A query builder is only thenable; `async` makes it a real Promise for `call`.
  await call(async () => client.rpc('delete_my_account'));
};
