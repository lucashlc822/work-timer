import { describe, expect, it } from 'vitest';

import { phaseFor, showsSyncing } from './syncPhase';

describe('phaseFor', () => {
  it('a finished round is synced', () => {
    const counts = { pushed: 0, pulled: 0, skipped: 0, rejected: 0 };
    expect(phaseFor({ ok: true, counts }, 'error', false)).toBe('synced');
  });

  it('a network failure is offline when the browser says so, unreachable otherwise', () => {
    expect(phaseFor({ ok: false, reason: 'network' }, 'synced', true)).toBe('offline');
    expect(phaseFor({ ok: false, reason: 'network' }, 'synced', false)).toBe('unreachable');
  });

  it('no usable sign-in reads the same way (typically an expired token while offline)', () => {
    expect(phaseFor({ ok: false, reason: 'signedOut' }, 'synced', true)).toBe('offline');
    expect(phaseFor({ ok: false, reason: 'signedOut' }, 'synced', false)).toBe('unreachable');
  });

  it('keeps the previous line while another window is syncing', () => {
    expect(phaseFor({ ok: false, reason: 'busy' }, 'unreachable', false)).toBe('unreachable');
  });

  it('maps the rest', () => {
    expect(phaseFor({ ok: false, reason: 'auth' }, 'synced', false)).toBe('unreachable');
    expect(phaseFor({ ok: false, reason: 'outdated' }, 'synced', false)).toBe('outdated');
    expect(phaseFor({ ok: false, reason: 'server' }, 'synced', false)).toBe('error');
  });
});

describe('showsSyncing', () => {
  it('shows it for the first round, when nothing has settled', () => {
    expect(showsSyncing(false, null)).toBe(true);
  });

  it('shows it for a round the person asked for', () => {
    expect(showsSyncing(true, 'unreachable')).toBe(true);
  });

  it('stays quiet for background rounds and retries once something has settled', () => {
    for (const settled of ['synced', 'offline', 'unreachable', 'outdated', 'error'] as const) {
      expect(showsSyncing(false, settled)).toBe(false);
    }
  });
});
