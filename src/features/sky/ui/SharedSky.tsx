import { activeShared, sharedTitle, type SharedState } from '../domain/shared';
import type { Tier } from '../domain/types';
import { useSky } from '../hooks/useSky';
import { ConstellationPicker, type SharedPick } from './ConstellationPicker';
import { minimumLabel } from './describe';

/**
 * The sky's part in shared constellations (M7 phase 5): picking a shape to
 * propose, choosing what the next session is for, and the line under Start.
 * `app/` passes the shared constellations in; the sky never fetches them.
 */

/** The constellation picker, handing the pick back instead of choosing it. */
export const SharedPicker = ({
  boughtTiers,
  ownedPacks,
  onPick,
  onClose,
}: {
  boughtTiers: ReadonlySet<Tier>;
  ownedPacks: ReadonlySet<string>;
  onPick: (pick: SharedPick) => void;
  onClose: () => void;
}) => {
  // Your own sky decides which tiers you can offer.
  const sky = useSky();
  if (sky === undefined) return null;
  return (
    <ConstellationPicker
      sky={sky}
      boughtTiers={boughtTiers}
      ownedPacks={ownedPacks}
      onPick={onPick}
      onClose={onClose}
    />
  );
};

/**
 * "Working on": your own constellation or a shared one. Shown only while you
 * have a shared one to build; fixed once the session starts.
 */
export const TargetPicker = ({
  shared,
  value,
  onChange,
  disabled,
}: {
  shared: readonly SharedState[];
  /** A shared constellation's id, or null for your own. */
  value: string | null;
  onChange: (sharedId: string | null) => void;
  disabled: boolean;
}) => {
  const sky = useSky();
  const options = activeShared(shared);
  if (options.length === 0) return null;
  const own = sky?.current?.def.name;

  return (
    <label className="text-ink-secondary flex items-center gap-2 text-xs">
      Working on
      <select
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        className="bg-night-800 border-night-600 text-ink-primary focus:border-lavender-400 rounded-pill border px-3 py-1.5 text-xs outline-none disabled:opacity-60"
      >
        <option value="">{own === undefined ? 'Your own sky' : `Your ${own}`}</option>
        {options.map((s) => (
          <option key={s.choice.id} value={s.choice.id}>
            {sharedTitle(s)}
          </option>
        ))}
      </select>
    </label>
  );
};

/** Under Start when the session is for a shared constellation: what it will add. */
export const SharedStartHint = ({
  shared,
  plannedS,
}: {
  shared: SharedState;
  plannedS: number;
}) => {
  const { minFocusS, starsNeeded: total } = shared;
  if (plannedS < minFocusS) {
    return (
      <p className="text-xs text-rose-300">
        Won&rsquo;t count toward {sharedTitle(shared)}: it needs {minimumLabel(minFocusS)}.
      </p>
    );
  }
  return (
    <p className="text-ink-muted text-xs">
      Adds star {shared.stars.length + 1} of {total} to {sharedTitle(shared)}
    </p>
  );
};
