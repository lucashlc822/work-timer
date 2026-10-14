import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { AuthFailure, deleteAccount } from './authRepository';

/** Just enough of a client for `rpc`. */
const clientWith = (rpc: () => Promise<{ error: unknown }>) =>
  ({ rpc: vi.fn(rpc) }) as unknown as SupabaseClient;

describe('deleteAccount', () => {
  it('calls the server function that deletes the signed-in account', async () => {
    const rpc = vi.fn(() => Promise.resolve({ error: null }));
    const client = { rpc } as unknown as SupabaseClient;

    await deleteAccount(client);

    expect(rpc).toHaveBeenCalledWith('delete_my_account');
  });

  // M5 U11: a refusal reaches the panel, so it can say nothing was removed.
  it('rejects with an AuthFailure when the server refuses', async () => {
    const client = clientWith(() =>
      Promise.resolve({ error: { message: 'permission denied', code: '42501' } }),
    );

    await expect(deleteAccount(client)).rejects.toBeInstanceOf(AuthFailure);
  });

  it('rejects with an AuthFailure when the request never arrives', async () => {
    const client = clientWith(() => Promise.reject(new TypeError('fetch failed')));

    await expect(deleteAccount(client)).rejects.toBeInstanceOf(AuthFailure);
  });
});
