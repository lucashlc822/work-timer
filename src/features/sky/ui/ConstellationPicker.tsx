import { useEffect, useRef, useState } from 'react';

import { LAVENDER_300 } from '../../../../design-tokens.mjs';
import { db, getLocalUserId } from '@/shared/db';
import { systemClock } from '@/shared/lib';

import { chooseConstellation, type ChoiceDraft } from '../data/skyRepository';
import { CATALOGUE, catalogueKeysForTier } from '../domain/catalogue';
import { unlockedTiers } from '../domain/derive';
import { generateName, generateShape } from '../domain/generate';
import { approximateFocusS, TIERS, UNLOCKED_BY } from '../domain/tiers';
import { TIER_ORDER, type ShapeDef, type SkyState, type Tier } from '../domain/types';
import { RULES } from '../hooks/useSky';
import { focusLabel, minimumLabel } from './describe';

const WILD_OPTIONS_PER_TIER = 3;

interface Option {
  key: string;
  draft: ChoiceDraft;
  name: string;
  shape: ShapeDef;
}

/**
 * Seeds for the generated options. Stable until something is chosen — a
 * reload shows the same three — because the inputs only change when a choice
 * is made or the user shuffles. Per-install via the local user id, so two
 * people do not see the same "wild" constellations.
 */
const wildSeed = (userId: string, tier: Tier, choiceCount: number, reroll: number, i: number) =>
  `${userId}:${tier}:${choiceCount}:${reroll}:${i}`;

const optionsFor = (tier: Tier, userId: string, choiceCount: number, reroll: number): Option[] => [
  ...catalogueKeysForTier(tier).map((key) => ({
    key,
    draft: { source: 'catalogue' as const, shapeId: key, seed: null, tier },
    name: CATALOGUE[key].name,
    shape: CATALOGUE[key].shape,
  })),
  ...Array.from({ length: WILD_OPTIONS_PER_TIER }, (_, i) => {
    const seed = wildSeed(userId, tier, choiceCount, reroll, i);
    return {
      key: seed,
      draft: { source: 'generated' as const, shapeId: null, seed, tier },
      name: generateName(seed),
      shape: generateShape(seed, tier),
    };
  }),
];

/**
 * Choose the next constellation.
 *
 * Each unlocked tier offers its hand-designed shapes plus a few generated
 * "wild" ones. Locked tiers say what unlocks them. Switching away from a
 * constellation with stars in it asks first, since it stays unfinished.
 */
export const ConstellationPicker = ({
  sky,
  boughtTiers,
  onClose,
}: {
  sky: SkyState;
  /** Tiers bought early with Stardust; choosable without finishing the tier below. */
  boughtTiers: ReadonlySet<Tier>;
  onClose: () => void;
}) => {
  const [userId, setUserId] = useState<string | null>(null);
  const [reroll, setReroll] = useState(0);
  const [pending, setPending] = useState<Option | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    void getLocalUserId(db).then(setUserId);
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const unlocked = unlockedTiers(sky, boughtTiers);
  const inProgress = sky.current !== null && sky.current.stars.length > 0 ? sky.current : null;

  const choose = async (option: Option) => {
    await chooseConstellation(db, option.draft, systemClock);
    onClose();
  };

  const select = (option: Option) => {
    if (inProgress !== null) setPending(option);
    else void choose(option);
  };

  return (
    <div className="bg-night-950/75 fixed inset-0 z-40 flex items-center justify-center p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="picker-title"
        className="rounded-soft border-night-600 bg-night-800 flex max-h-full w-full max-w-md flex-col border"
      >
        <header className="border-night-700 flex items-center justify-between border-b px-5 py-3">
          <h2 id="picker-title" className="text-ink-primary">
            Choose a constellation
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="text-ink-muted hover:text-ink-secondary text-sm transition-colors"
          >
            Close
          </button>
        </header>

        {pending !== null && inProgress !== null ? (
          <div className="space-y-4 p-5 text-center">
            <p className="text-ink-secondary text-sm">
              Switch from {inProgress.def.name}? Its {inProgress.stars.length}{' '}
              {inProgress.stars.length === 1 ? 'star stays' : 'stars stay'} in your sky, unfinished.
            </p>
            <div className="flex justify-center gap-2">
              <button
                type="button"
                onClick={() => setPending(null)}
                className="rounded-pill bg-lavender-400 text-night-900 hover:bg-lavender-300 px-5 py-2 text-sm transition-colors"
              >
                Keep building
              </button>
              <button
                type="button"
                onClick={() => void choose(pending)}
                className="rounded-pill text-ink-muted hover:text-ink-primary px-5 py-2 text-sm transition-colors"
              >
                Switch to {pending.name}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-5 overflow-y-auto p-5">
            {TIER_ORDER.map((tier) => (
              <section key={tier} aria-labelledby={`tier-${tier}`} className="space-y-2">
                <h3
                  id={`tier-${tier}`}
                  className="text-ink-secondary text-xs tracking-widest uppercase"
                >
                  {TIERS[tier].label}
                  <span className="text-ink-muted tracking-normal normal-case">
                    {' '}
                    · {TIERS[tier].stars[0]}–{TIERS[tier].stars[1]} stars ·{' '}
                    {minimumLabel(RULES[tier].minSessionS)}
                  </span>
                </h3>
                {!unlocked[tier] ? (
                  <p className="text-ink-muted text-xs">
                    Finish one {UNLOCKED_BY[tier]} constellation to unlock, or buy it with Stardust.
                  </p>
                ) : userId === null ? null : (
                  <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {optionsFor(tier, userId, sky.constellations.length, reroll).map((option) => (
                      <li key={option.key}>
                        <button
                          type="button"
                          onClick={() => select(option)}
                          className="rounded-soft border-night-600 hover:border-lavender-400 flex w-full flex-col items-center gap-1 border p-2 text-center transition-colors"
                        >
                          <Silhouette shape={option.shape} />
                          <span className="text-ink-primary text-xs">{option.name}</span>
                          <span className="text-ink-muted text-[10px]">
                            {option.draft.source === 'generated' && 'Wild · '}
                            {option.shape.points.length} stars · ≈
                            {focusLabel(approximateFocusS(tier, option.shape.points.length, RULES))}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setReroll((n) => n + 1)}
                className="rounded-pill border-night-600 text-ink-secondary hover:border-lavender-400 hover:text-ink-primary border px-4 py-1.5 text-xs transition-colors"
              >
                Shuffle wild constellations
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/** A small preview of a shape: every star and line, unearned. */
const Silhouette = ({ shape }: { shape: ShapeDef }) => (
  <svg width={72} height={72} viewBox="-0.08 -0.08 1.16 1.16" aria-hidden="true">
    {shape.edges.map(([a, b]) => (
      <line
        key={`${a}-${b}`}
        x1={shape.points[a]![0]}
        y1={shape.points[a]![1]}
        x2={shape.points[b]![0]}
        y2={shape.points[b]![1]}
        stroke={LAVENDER_300}
        strokeOpacity={0.5}
        strokeWidth={0.015}
      />
    ))}
    {shape.points.map(([x, y], i) => (
      <circle key={i} cx={x} cy={y} r={0.03} fill={LAVENDER_300} />
    ))}
  </svg>
);
