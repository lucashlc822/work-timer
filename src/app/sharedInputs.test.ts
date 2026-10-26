import { describe, expect, it } from 'vitest';

import type { SharedRow } from '@/features/friends';
import { deriveShared } from '@/features/sky';
import type { SessionRow } from '@/shared/db';

import { fromDevice, sharedCompletions, toSharedInput } from './sharedInputs';

const T0 = Date.parse('2026-10-26T09:00:00Z');
const at = (min: number) => T0 + min * 60_000;
const ME = 'me';
const ADA = 'ada';

const serverSession = (id: string, userId: string, endedMin: number) => ({
  id,
  userId,
  seed: `seed-${id}`,
  startedAt: at(endedMin - 25),
  endedAt: at(endedMin),
  actualFocusS: 1500,
});

const kite = (sessions: SharedRow['sessions']): SharedRow => ({
  id: 'sh-1',
  proposedBy: ADA,
  partnerId: ADA,
  partnerName: 'Ada',
  source: 'catalogue',
  shapeId: 'kite',
  seed: null,
  tier: 'easy',
  starsNeeded: 4,
  minFocusS: 0,
  createdAt: at(0),
  acceptedAt: at(1),
  stoppedAt: null,
  sessions,
});

/** A session of this device's, finished, run for `sharedId`. */
const mine = (id: string, endedMin: number, extra: Partial<SessionRow> = {}): SessionRow => ({
  id,
  mode: 'countdown',
  plannedDurationS: 1500,
  actualFocusS: 1500,
  startedAt: at(endedMin - 25),
  endedAt: at(endedMin),
  outcome: 'completed',
  awayMs: 0,
  tagId: null,
  seed: `seed-${id}`,
  device: 'web',
  clientCreatedAt: at(endedMin - 25),
  syncedAt: null,
  sharedId: 'sh-1',
  ...extra,
});

const threeOnServer = kite([
  serverSession('a1', ADA, 30),
  serverSession('m1', ME, 60),
  serverSession('a2', ADA, 90),
]);

describe('shared constellations in the app (M7 phase 5)', () => {
  it('shows your own unsynced star at once', () => {
    const own = [fromDevice(mine('m2', 120))!];
    const shown = deriveShared(toSharedInput(threeOnServer, own));
    expect(shown.stars.map((s) => s.id)).toEqual(['a1', 'm1', 'a2', 'm2']);
    expect(shown.complete).toBe(true);
  });

  // S5.3
  it('pays only for what the server has: an unsynced last star pays nothing yet', () => {
    expect(sharedCompletions([threeOnServer])).toEqual([]);
    const synced = kite([...threeOnServer.sessions, serverSession('m2', ME, 120)]);
    expect(sharedCompletions([synced])).toEqual([
      { sharedId: 'sh-1', tier: 'easy', completedAt: at(120) },
    ]);
  });

  it('counts your session once when it is both on this device and on the server', () => {
    const own = [fromDevice(mine('m1', 60, { syncedAt: at(61) }))!];
    const shown = deriveShared(toSharedInput(threeOnServer, own));
    expect(shown.stars.map((s) => s.id)).toEqual(['a1', 'm1', 'a2']);
  });

  it('only completed sessions of this device, run for a shared constellation, are added', () => {
    expect(fromDevice(mine('x', 10, { outcome: 'cancelled' }))).toBeNull();
    expect(fromDevice(mine('y', 10, { endedAt: null, outcome: null }))).toBeNull();
    const { sharedId: _none, ...personal } = mine('z', 10);
    expect(fromDevice(personal)).toBeNull();
  });

  it('a session for another shared constellation is not added to this one', () => {
    const other = [fromDevice(mine('o', 120, { sharedId: 'sh-2' }))!];
    expect(deriveShared(toSharedInput(threeOnServer, other)).stars).toHaveLength(3);
  });

  it('a partner with no name still reads', () => {
    expect(toSharedInput({ ...threeOnServer, partnerName: null }).partnerName).toBe('a friend');
  });
});
