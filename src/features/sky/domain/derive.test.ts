import { describe, expect, it } from 'vitest';

import { deriveSky, startVerdict, unlockedTiers } from './derive';
import { tierRules } from './tiers';
import type { CompletedSession, ConstellationChoice } from './types';

const rules = tierRules(false);
const MIN = 60;
const T0 = 1_700_000_000_000;

let n = 0;
/** A completed session ending at `endedAtMin` minutes after T0. */
const session = (endedAtMin: number, focusMin = 25): CompletedSession => {
  n += 1;
  const endedAt = T0 + endedAtMin * 60_000;
  return {
    id: `s${String(n).padStart(3, '0')}`,
    seed: `seed-${n}`,
    startedAt: endedAt - focusMin * 60_000,
    endedAt,
    actualFocusS: focusMin * MIN,
  };
};

const choose = (
  atMin: number,
  shapeId: string,
  tier: ConstellationChoice['tier'],
): ConstellationChoice => ({
  id: `c-${shapeId}-${atMin}`,
  source: 'catalogue',
  shapeId,
  seed: null,
  tier,
  chosenAt: T0 + atMin * 60_000,
});

describe('deriveSky', () => {
  it('makes every session a wandering star when nothing was ever chosen', () => {
    const sky = deriveSky([session(10), session(20)], [], rules);
    expect(sky.constellations).toEqual([]);
    expect(sky.wandering.map((w) => w.reason)).toEqual(['no-constellation', 'no-constellation']);
    expect(sky.current).toBeNull();
  });

  it('fills slots in order with sessions that end after the choice', () => {
    const before = session(5);
    const first = session(20);
    const second = session(40);
    const sky = deriveSky([before, first, second], [choose(10, 'kite', 'easy')], rules);

    expect(sky.current?.stars.map((s) => s.id)).toEqual([first.id, second.id]);
    expect(sky.wandering.map((w) => w.session.id)).toEqual([before.id]);
  });

  // O2.6
  it('completes on the Nth star, dated to that star, and wanders the next one', () => {
    const stars = [session(20), session(40), session(60), session(80)]; // kite has 4
    const extra = session(100);
    const sky = deriveSky([...stars, extra], [choose(10, 'kite', 'easy')], rules);
    const kite = sky.constellations[0]!;

    expect(kite.complete).toBe(true);
    expect(kite.completedAt).toBe(stars[3]!.endedAt);
    expect(sky.current).toBeNull();
    expect(sky.wandering).toEqual([
      { session: extra, reason: 'constellation-complete', constellationId: kite.choice.id },
    ]);
  });

  // O3.8
  it('accepts a session exactly at the tier minimum and rejects one a second short', () => {
    const exact = session(100, 50);
    const short = { ...session(200, 50), actualFocusS: 50 * MIN - 1 };
    const sky = deriveSky([exact, short], [choose(10, 'heron', 'hard')], rules);

    expect(sky.current?.stars.map((s) => s.id)).toEqual([exact.id]);
    expect(sky.wandering).toEqual([
      { session: short, reason: 'too-short', constellationId: sky.current?.choice.id },
    ]);
  });

  // O3.9
  it('counts a session that was already running when the choice was made', () => {
    const running = session(30, 25); // started at minute 5, ended at 30
    const sky = deriveSky([running], [choose(15, 'kite', 'easy')], rules);
    expect(sky.current?.stars).toEqual([running]);
  });

  it('marks an unfinished constellation abandoned when another is chosen, and keeps its stars', () => {
    const a = session(20);
    const b = session(60);
    const sky = deriveSky([a, b], [choose(10, 'kite', 'easy'), choose(30, 'arrow', 'easy')], rules);

    expect(sky.constellations[0]).toMatchObject({ abandoned: true, complete: false });
    expect(sky.constellations[0]!.stars).toEqual([a]);
    expect(sky.current?.def.shapeId).toBe('arrow');
    expect(sky.current?.stars).toEqual([b]);
  });

  // O1.2
  it('gives the same sky whatever order the rows arrive in', () => {
    const sessions = Array.from({ length: 12 }, (_, i) => session(20 + i * 20, 30));
    const choices = [choose(10, 'kite', 'easy'), choose(150, 'lantern', 'medium')];
    const forward = deriveSky(sessions, choices, rules);
    const shuffled = deriveSky([...sessions].reverse(), [...choices].reverse(), rules);
    expect(JSON.stringify(shuffled)).toBe(JSON.stringify(forward));
  });

  it('falls back to a generated shape for an unknown catalogue key rather than throwing', () => {
    const sky = deriveSky([], [choose(10, 'no-such-shape', 'easy')], rules);
    expect(sky.current?.def.source).toBe('generated');
    expect(sky.current?.def.shape.points.length).toBeGreaterThan(0);
  });

  it('applies the dev minimums when asked', () => {
    const oneMinute = session(20, 1);
    const dev = deriveSky([oneMinute], [choose(10, 'heron', 'hard')], tierRules(true));
    expect(dev.wandering[0]?.reason).toBe('too-short'); // hard needs 2 in dev
    const devMedium = deriveSky([oneMinute], [choose(10, 'lantern', 'medium')], tierRules(true));
    expect(devMedium.current?.stars).toEqual([oneMinute]);
  });
});

// O5.14
describe('unlockedTiers', () => {
  it('opens only easy on a fresh sky', () => {
    expect(unlockedTiers(deriveSky([], [], rules))).toEqual({
      easy: true,
      medium: false,
      hard: false,
    });
  });

  it('opens medium after one finished easy, and hard after one finished medium', () => {
    const fourStars = [session(20), session(40), session(60), session(80)];
    const afterEasy = deriveSky(fourStars, [choose(10, 'kite', 'easy')], rules);
    expect(unlockedTiers(afterEasy)).toEqual({ easy: true, medium: true, hard: false });

    const sevenStars = Array.from({ length: 7 }, (_, i) => session(200 + i * 30, 30));
    const afterMedium = deriveSky(
      [...fourStars, ...sevenStars],
      [choose(10, 'kite', 'easy'), choose(150, 'lantern', 'medium')],
      rules,
    );
    expect(unlockedTiers(afterMedium)).toEqual({ easy: true, medium: true, hard: true });
  });

  it('counts a finished generated constellation the same as a catalogue one', () => {
    const generated: ConstellationChoice = {
      id: 'gen-1',
      source: 'generated',
      shapeId: null,
      seed: 'wild-seed',
      tier: 'easy',
      chosenAt: T0,
    };
    const size = deriveSky([], [generated], rules).current!.def.shape.points.length;
    const stars = Array.from({ length: size }, (_, i) => session(10 + i * 10));
    expect(unlockedTiers(deriveSky(stars, [generated], rules)).medium).toBe(true);
  });

  it('does not count an abandoned constellation', () => {
    const sky = deriveSky(
      [session(20), session(40)],
      [choose(10, 'kite', 'easy'), choose(50, 'arrow', 'easy')],
      rules,
    );
    expect(unlockedTiers(sky).medium).toBe(false);
  });
});

describe('startVerdict', () => {
  it('warns before a session too short for the current constellation', () => {
    const sky = deriveSky([], [choose(10, 'heron', 'hard')], rules);
    expect(startVerdict(sky, 25 * MIN, rules)).toMatchObject({
      kind: 'too-short',
      minSessionS: 50 * MIN,
    });
    expect(startVerdict(sky, 50 * MIN, rules).kind).toBe('counts');
  });

  it('reports when nothing is being built', () => {
    expect(startVerdict(deriveSky([], [], rules), 25 * MIN, rules).kind).toBe('no-constellation');
  });
});
