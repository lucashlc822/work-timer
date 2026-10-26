import { describe, expect, it } from 'vitest';

import type { SessionRow } from '@/shared/db';

import { sessionFromWire, sessionToWire } from './wire';

const T0 = Date.parse('2026-10-24T09:00:00Z');

const finished = (extra: Partial<SessionRow> = {}): SessionRow => ({
  id: '11111111-0000-4000-8000-000000000001',
  mode: 'countdown',
  plannedDurationS: 1500,
  actualFocusS: 1500,
  startedAt: T0,
  endedAt: T0 + 1_500_000,
  outcome: 'completed',
  awayMs: 0,
  tagId: null,
  seed: 'seed-1',
  device: 'web',
  clientCreatedAt: T0,
  syncedAt: null,
  ...extra,
});

/** What the server hands back: the uploaded columns plus its own stamp. */
const pulled = (row: SessionRow) => ({
  ...sessionToWire(row),
  server_updated_at: '2026-10-24T09:30:00Z',
});

describe('session wire mapping: the focus-together room (M7)', () => {
  it('uploads the room a session ran in, and reads it back', () => {
    const row = finished({ togetherId: '22222222-0000-4000-8000-000000000002' });
    expect(sessionToWire(row).together_id).toBe('22222222-0000-4000-8000-000000000002');
    expect(sessionFromWire(pulled(row), 1)?.togetherId).toBe(
      '22222222-0000-4000-8000-000000000002',
    );
  });

  it('a solo session uploads null and reads back with no room at all', () => {
    const row = finished();
    expect(sessionToWire(row).together_id).toBeNull();
    expect(sessionFromWire(pulled(row), 1)).not.toHaveProperty('togetherId');
  });

  it('a row from an older app, without the column, still reads', () => {
    const { together_id: _dropped, ...older } = pulled(finished());
    const read = sessionFromWire(older, 1);
    expect(read?.id).toBe('11111111-0000-4000-8000-000000000001');
    expect(read).not.toHaveProperty('togetherId');
  });
});

describe('session wire mapping: the shared constellation (M7 phase 5)', () => {
  it('uploads the shared constellation a session was run for, and reads it back', () => {
    const row = finished({ sharedId: '33333333-0000-4000-8000-000000000003' });
    expect(sessionToWire(row).shared_id).toBe('33333333-0000-4000-8000-000000000003');
    expect(sessionFromWire(pulled(row), 1)?.sharedId).toBe('33333333-0000-4000-8000-000000000003');
  });

  it('a session for one’s own sky uploads null and reads back with none', () => {
    const row = finished();
    expect(sessionToWire(row).shared_id).toBeNull();
    expect(sessionFromWire(pulled(row), 1)).not.toHaveProperty('sharedId');
  });

  it('a row from an older app, without the column, still reads', () => {
    const { shared_id: _dropped, ...older } = pulled(finished());
    const read = sessionFromWire(older, 1);
    expect(read?.id).toBe('11111111-0000-4000-8000-000000000001');
    expect(read).not.toHaveProperty('sharedId');
  });
});
