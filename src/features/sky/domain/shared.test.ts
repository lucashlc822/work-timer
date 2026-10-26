import { describe, expect, it } from 'vitest';

import { deriveShared, type SharedInput } from './shared';
import type { CompletedSession } from './types';

const T0 = 1_700_000_000_000;
const at = (min: number) => T0 + min * 60_000;

/** A completed session for shared constellation `sh-1`, ending `endedMin` after T0. */
const session = (id: string, endedMin: number, focusMin = 25): CompletedSession => ({
  id,
  seed: `seed-${id}`,
  startedAt: at(endedMin - focusMin),
  endedAt: at(endedMin),
  actualFocusS: focusMin * 60,
  sharedId: 'sh-1',
});

const kite = (extra: Partial<SharedInput> = {}): SharedInput => ({
  id: 'sh-1',
  partnerName: 'Bea',
  // The kite has four points.
  choice: {
    id: 'sh-1',
    source: 'catalogue',
    shapeId: 'kite',
    seed: null,
    tier: 'easy',
    chosenAt: at(0),
  },
  starsNeeded: 4,
  minFocusS: 10 * 60,
  acceptedAt: at(0),
  stoppedAt: null,
  sessions: [],
  ...extra,
});

describe('deriveShared (S3.2)', () => {
  it('fills from both members in end order, whatever order they arrive in', () => {
    const ada1 = session('a1', 30);
    const bea1 = session('b1', 20);
    const ada2 = session('a2', 40);
    const shared = deriveShared(kite({ sessions: [ada2, ada1, bea1] }));
    expect(shared.stars.map((s) => s.id)).toEqual(['b1', 'a1', 'a2']);
    expect(shared.status).toBe('active');
    expect(shared.complete).toBe(false);
    expect(shared.partnerName).toBe('Bea');
    expect(shared.def.name).toBe('The Kite');
  });

  it('breaks an end-time tie by id', () => {
    const shared = deriveShared(kite({ sessions: [session('z', 30), session('m', 30)] }));
    expect(shared.stars.map((s) => s.id)).toEqual(['m', 'z']);
  });

  it('skips sessions before acceptance and ones too short for it', () => {
    const shared = deriveShared(
      kite({
        acceptedAt: at(15),
        sessions: [session('early', 10), session('short', 20, 5), session('ok', 30)],
      }),
    );
    expect(shared.stars.map((s) => s.id)).toEqual(['ok']);
  });

  it('counts a session ending exactly at acceptance, not one ending exactly at the stop', () => {
    const shared = deriveShared(
      kite({
        acceptedAt: at(10),
        stoppedAt: at(50),
        sessions: [
          session('edge', 10),
          session('in', 30),
          session('stop', 50),
          session('after', 60),
        ],
      }),
    );
    expect(shared.stars.map((s) => s.id)).toEqual(['edge', 'in']);
    expect(shared.status).toBe('stopped');
  });

  it('completes on the last star and takes nothing past full', () => {
    const sessions = ['s1', 's2', 's3', 's4', 's5'].map((id, i) => session(id, 10 * (i + 1)));
    const shared = deriveShared(kite({ sessions }));
    expect(shared.stars.map((s) => s.id)).toEqual(['s1', 's2', 's3', 's4']);
    expect(shared.complete).toBe(true);
    expect(shared.completedAt).toBe(at(40));
    expect(shared.status).toBe('complete');
  });

  it('stays complete when it was stopped after it finished', () => {
    const sessions = ['s1', 's2', 's3', 's4'].map((id, i) => session(id, 10 * (i + 1)));
    expect(deriveShared(kite({ sessions, stoppedAt: at(90) })).status).toBe('complete');
  });

  it('counts the same session once when it arrives from this device and the server', () => {
    const mine = session('mine', 20);
    const shared = deriveShared(kite({ sessions: [mine, { ...mine }, session('b', 30)] }));
    expect(shared.stars.map((s) => s.id)).toEqual(['mine', 'b']);
  });

  it('is a proposal with no stars until accepted', () => {
    const shared = deriveShared(kite({ acceptedAt: null, sessions: [session('x', 20)] }));
    expect(shared.status).toBe('proposed');
    expect(shared.stars).toEqual([]);
  });

  it('never needs more stars than the shape has points', () => {
    const sessions = ['s1', 's2', 's3', 's4'].map((id, i) => session(id, 10 * (i + 1)));
    expect(deriveShared(kite({ starsNeeded: 9, sessions })).complete).toBe(true);
  });

  it('draws a generated shape from its seed, like a personal choice', () => {
    const choice = {
      id: 'sh-1',
      source: 'generated' as const,
      shapeId: null,
      seed: 'wild',
      tier: 'easy' as const,
      chosenAt: at(0),
    };
    const shared = deriveShared(kite({ choice }));
    expect(shared.def.source).toBe('generated');
    expect(shared.def.seed).toBe('wild');
  });
});
