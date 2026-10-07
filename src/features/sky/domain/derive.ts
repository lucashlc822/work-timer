import { catalogueEntry } from './catalogue';
import { generateName, generateShape } from './generate';
import { UNLOCKED_BY } from './tiers';
import {
  TIER_ORDER,
  type CompletedSession,
  type ConstellationChoice,
  type ConstellationDef,
  type ConstellationState,
  type SkyState,
  type Tier,
  type TierRules,
  type WanderingStar,
} from './types';

/**
 * Turn a stored choice back into a constellation.
 *
 * A catalogue key that no longer exists (it never should — keys are permanent)
 * falls back to a generated shape seeded by the choice id, so a bad row
 * degrades to a different picture rather than a crash.
 */
export const resolveDef = (choice: ConstellationChoice): ConstellationDef => {
  if (choice.source === 'catalogue' && choice.shapeId !== null) {
    const entry = catalogueEntry(choice.shapeId);
    if (entry !== undefined) {
      return {
        source: 'catalogue',
        shapeId: choice.shapeId,
        seed: null,
        name: entry.name,
        tier: entry.tier,
        shape: entry.shape,
      };
    }
  }
  const seed = choice.seed ?? choice.id;
  return {
    source: 'generated',
    shapeId: null,
    seed,
    name: generateName(seed),
    tier: choice.tier,
    shape: generateShape(seed, choice.tier),
  };
};

const byChosenAt = (a: ConstellationChoice, b: ConstellationChoice): number =>
  a.chosenAt - b.chosenAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const byEndedAt = (a: CompletedSession, b: CompletedSession): number =>
  a.endedAt - b.endedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * The whole sky, from completed sessions and the user's choices.
 *
 * - Each choice owns a **window** from its `chosenAt` up to the next choice.
 * - Sessions are taken in `endedAt` order. One whose `endedAt` falls in a
 *   window, and that meets the tier's minimum length, fills the next slot.
 *   Using `endedAt` means a constellation chosen mid-session gets that session.
 * - The Nth star completes the constellation, and `completedAt` is that star's
 *   `endedAt`. Later sessions in the window wander until a new choice.
 * - An unfinished constellation followed by another choice is `abandoned`.
 *
 * Pure and order-independent: the inputs are sorted here, so the same rows
 * produce the same sky on every device, whatever order they were read in.
 */
export const deriveSky = (
  sessions: readonly CompletedSession[],
  choices: readonly ConstellationChoice[],
  rules: TierRules,
): SkyState => {
  const orderedChoices = [...choices].sort(byChosenAt);
  const states: ConstellationState[] = orderedChoices.map((choice) => ({
    choice,
    def: resolveDef(choice),
    stars: [],
    complete: false,
    completedAt: null,
    abandoned: false,
  }));
  const wandering: WanderingStar[] = [];

  let window = -1;
  for (const session of [...sessions].sort(byEndedAt)) {
    while (window + 1 < states.length && states[window + 1]!.choice.chosenAt <= session.endedAt) {
      window += 1;
    }

    const state = window >= 0 ? states[window]! : null;
    if (state === null) {
      wandering.push({ session, reason: 'no-constellation', constellationId: null });
    } else if (state.complete) {
      wandering.push({
        session,
        reason: 'constellation-complete',
        constellationId: state.choice.id,
      });
    } else if (session.actualFocusS < rules[state.def.tier].minSessionS) {
      wandering.push({ session, reason: 'too-short', constellationId: state.choice.id });
    } else {
      state.stars.push(session);
      if (state.stars.length === state.def.shape.points.length) {
        state.complete = true;
        state.completedAt = session.endedAt;
      }
    }
  }

  states.forEach((state, i) => {
    state.abandoned = !state.complete && i < states.length - 1;
  });

  const last = states.at(-1);
  return { constellations: states, wandering, current: last && !last.complete ? last : null };
};

/** Finished constellations per tier. Catalogue and generated count alike. */
export const completedByTier = (sky: SkyState): Record<Tier, number> => {
  const counts: Record<Tier, number> = { easy: 0, medium: 0, hard: 0 };
  for (const c of sky.constellations) if (c.complete) counts[c.def.tier] += 1;
  return counts;
};

/** Which tiers can be chosen: easy always, each other after one of the tier below. */
export const unlockedTiers = (sky: SkyState): Record<Tier, boolean> => {
  const done = completedByTier(sky);
  const result = {} as Record<Tier, boolean>;
  for (const tier of TIER_ORDER) {
    const requires = UNLOCKED_BY[tier];
    result[tier] = requires === null || done[requires] >= 1;
  }
  return result;
};

export type StartVerdict =
  | { kind: 'counts'; constellation: ConstellationState }
  | { kind: 'too-short'; constellation: ConstellationState; minSessionS: number }
  | { kind: 'no-constellation' };

/**
 * Would a session of `plannedS` seconds, completed now, become a star in the
 * current constellation? Drives the warning shown before starting.
 */
export const startVerdict = (sky: SkyState, plannedS: number, rules: TierRules): StartVerdict => {
  const current = sky.current;
  if (current === null) return { kind: 'no-constellation' };
  const minSessionS = rules[current.def.tier].minSessionS;
  return plannedS >= minSessionS
    ? { kind: 'counts', constellation: current }
    : { kind: 'too-short', constellation: current, minSessionS };
};
