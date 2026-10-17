import { describe, expect, it } from 'vitest';

import { newId, stableId } from './id';

// Postgres accepts any well-formed uuid; this also pins the version-8 and
// RFC variant bits that stableId sets.
const UUID_V8 = /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('stableId', () => {
  it('gives the same id for the same key, every time', () => {
    expect(stableId('u1:session:abc')).toBe(stableId('u1:session:abc'));
  });

  // Pinned so a change to the hash (which would re-mint every ledger id and
  // double-credit everyone on their next sync) fails loudly.
  it('is stable across releases', () => {
    expect(stableId('user-1:goal:2026-10-20')).toBe(stableId('user-1:goal:2026-10-20'));
    expect(stableId('')).toMatch(UUID_V8);
    expect(stableId('golden')).toMatchInlineSnapshot(`"7be62d41-aab9-833c-b7bd-b5df7e4cd84d"`);
  });

  it('is a well-formed version-8 uuid', () => {
    for (const key of ['', 'a', 'u1:purchase:style-rose', 'x'.repeat(500), 'émoji ✦']) {
      expect(stableId(key)).toMatch(UUID_V8);
    }
  });

  it('differs for different keys, including the same fact for two different people', () => {
    expect(stableId('alice:goal:2026-10-20')).not.toBe(stableId('bob:goal:2026-10-20'));
    expect(stableId('u1:goal:2026-10-20')).not.toBe(stableId('u1:goal:2026-10-21'));
    const ids = new Set(Array.from({ length: 10_000 }, (_, i) => stableId(`u1:session:${i}`)));
    expect(ids.size).toBe(10_000);
  });

  it('never collides with a random id by construction (different version)', () => {
    expect(newId()[14]).toBe('4');
    expect(stableId('k')[14]).toBe('8');
  });
});
