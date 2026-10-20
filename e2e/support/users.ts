import { randomUUID } from 'node:crypto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { localStack } from './localStack';

/**
 * Fresh test users on the local stack. Every test makes its own, with an
 * address no other test or run uses, so tests run in parallel and need no
 * `db reset` between runs. Addresses are `@test.local` and exist only in the
 * local stack's database.
 */

/** Local stack only; recorded here rather than generated so a failed run can be signed into by hand. */
export const TEST_PASSWORD = 'e2e-test-pass-1';

export interface TestUser {
  id: string;
  email: string;
  password: string;
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

let admin: SupabaseClient | undefined;

/** The local stack's service-role client: bypasses row-level security. Setup and checks only. */
export const adminClient = (): SupabaseClient => {
  const stack = localStack();
  admin ??= createClient(stack.url, stack.secretKey, noSession);
  return admin;
};

let counter = 0;
const RUN = Date.now().toString(36);

export const uniqueEmail = (label = 'user'): string =>
  `e2e-${label}-${RUN}-${process.pid}-${counter++}@test.local`;

/** Puts `email` on the invite list, as `npm run invite -- add … --local` would. */
export const invite = async (email: string): Promise<void> => {
  const { error } = await adminClient().from('invites').insert({ email });
  if (error) throw new Error(`Couldn't invite ${email}: ${error.message}`);
};

/** An invited user whose address is already confirmed, ready to sign in. */
export const createUser = async (label = 'user', password = TEST_PASSWORD): Promise<TestUser> => {
  const email = uniqueEmail(label);
  await invite(email);
  const { data, error } = await adminClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`Couldn't create ${email}: ${error.message}`);
  return { id: data.user.id, email, password };
};

/** A client signed in as `user`, the way the app's own client is (publishable key + password). */
export const signedInClient = async (user: TestUser): Promise<SupabaseClient> => {
  const stack = localStack();
  const client = createClient(stack.url, stack.publishableKey, noSession);
  const { error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error) throw new Error(`Couldn't sign in as ${user.email}: ${error.message}`);
  return client;
};

export const newId = (): string => randomUUID();
