import { describe, expect, it } from 'vitest';

import { decodeFriendSky } from './friendSky';
import { decodeShared, incomingProposals, openWith, type SharedRow } from './shared';

const ME = 'me-0000';
const ADA = 'ada-0000';

const wire = (extra: Record<string, unknown> = {}) => ({
  id: 'sh-1',
  proposed_by: ADA,
  partner_id: ADA,
  partner_name: 'Ada',
  source: 'catalogue',
  shape_id: 'kite',
  seed: null,
  tier: 'easy',
  stars_needed: 4,
  min_focus_s: 0,
  created_at: '2026-10-26T09:00:00Z',
  accepted_at: '2026-10-26T09:05:00Z',
  stopped_at: null,
  stopped_by: null,
  sessions: [
    {
      id: 's1',
      user_id: ADA,
      seed: 'seed-1',
      started_at: '2026-10-26T09:10:00Z',
      ended_at: '2026-10-26T09:35:00Z',
      actual_focus_s: 1500,
      star_style: 'ember',
    },
    { id: 'bad', user_id: ADA },
  ],
  ...extra,
});

describe('decodeShared', () => {
  it('reads a row and its readable sessions', () => {
    const [row] = decodeShared([wire()]);
    expect(row).toMatchObject({
      id: 'sh-1',
      proposedBy: ADA,
      partnerName: 'Ada',
      tier: 'easy',
      starsNeeded: 4,
      acceptedAt: Date.parse('2026-10-26T09:05:00Z'),
      stoppedAt: null,
    });
    expect(row!.sessions).toEqual([
      {
        id: 's1',
        userId: ADA,
        seed: 'seed-1',
        startedAt: Date.parse('2026-10-26T09:10:00Z'),
        endedAt: Date.parse('2026-10-26T09:35:00Z'),
        actualFocusS: 1500,
        starStyle: 'ember',
      },
    ]);
  });

  it('drops rows it cannot read rather than failing', () => {
    expect(decodeShared([wire({ tier: 'cosmic' }), wire({ id: 'ok' }), 'nonsense'])).toHaveLength(
      1,
    );
    expect(decodeShared(null)).toEqual([]);
  });

  it('keeps a proposal (no acceptance) and a nameless partner', () => {
    const [row] = decodeShared([wire({ accepted_at: null, partner_name: null })]);
    expect(row!.acceptedAt).toBeNull();
    expect(row!.partnerName).toBeNull();
  });
});

describe('which shared constellation is open with a friend', () => {
  const rows = (...extra: Record<string, unknown>[]): SharedRow[] =>
    decodeShared(extra.map((e) => wire(e)));
  const notDone = () => ({ name: 'Kite', stars: 0, total: 4, done: false });

  it('a finished or stopped one is not open; a proposal or a filling one is', () => {
    const done = () => ({ name: 'Kite', stars: 4, total: 4, done: true });
    expect(openWith(rows({}), ADA, done)).toBeNull();
    expect(openWith(rows({ stopped_at: '2026-10-26T10:00:00Z' }), ADA, notDone)).toBeNull();
    expect(openWith(rows({ accepted_at: null }), ADA, notDone)?.id).toBe('sh-1');
    expect(openWith(rows({}), 'someone-else', notDone)).toBeNull();
  });

  it('only proposals someone else made count as waiting for you', () => {
    const list = rows(
      { id: 'theirs', accepted_at: null, proposed_by: ADA },
      { id: 'mine', accepted_at: null, proposed_by: ME },
      { id: 'active' },
    );
    expect(incomingProposals(list, ME).map((r) => r.id)).toEqual(['theirs']);
    expect(incomingProposals(null, ME)).toEqual([]);
  });
});

describe('a friend’s sky marks sessions run for a shared constellation', () => {
  it('reads shared_id onto the session, and leaves it absent otherwise', () => {
    const sky = decodeFriendSky({
      display_name: 'Ada',
      sky_theme: null,
      sessions: [
        {
          id: 'a',
          seed: 's',
          started_at: '2026-10-26T09:00:00Z',
          ended_at: '2026-10-26T09:25:00Z',
          actual_focus_s: 1500,
          outcome: 'completed',
          star_style: null,
          shared_id: 'sh-1',
        },
        {
          id: 'b',
          seed: 's',
          started_at: '2026-10-26T10:00:00Z',
          ended_at: '2026-10-26T10:25:00Z',
          actual_focus_s: 1500,
          outcome: 'completed',
          star_style: null,
          shared_id: null,
        },
      ],
      constellations: [],
    });
    expect(sky!.sessions[0]!.sharedId).toBe('sh-1');
    expect(sky!.sessions[1]).not.toHaveProperty('sharedId');
  });
});
