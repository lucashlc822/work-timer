import { useCallback, useState } from 'react';

import type { Tier } from '../domain/types';
import { useSky } from '../hooks/useSky';
import { ConstellationPicker } from './ConstellationPicker';

/**
 * What is being built right now, and the way into the picker. Highlighted
 * when nothing is in progress, since every session until then wanders.
 */
export const ConstellationStatus = ({ boughtTiers }: { boughtTiers: ReadonlySet<Tier> }) => {
  const sky = useSky();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  if (sky === undefined) return null;

  const current = sky.current;
  const prompt = current === null;
  const label = prompt
    ? sky.constellations.some((c) => c.complete)
      ? 'Choose your next constellation'
      : 'Choose a constellation'
    : `${current.def.name} · ${current.stars.length} of ${current.def.shape.points.length}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={prompt ? label : `Building ${label}. Change constellation`}
        className={`rounded-pill border px-4 py-1.5 text-xs transition-colors ${
          prompt
            ? 'border-lavender-400 bg-lavender-400/15 text-ink-primary hover:bg-lavender-400/25'
            : 'border-night-600 text-ink-secondary hover:border-lavender-400 hover:text-ink-primary'
        }`}
      >
        {label}
      </button>
      {open && <ConstellationPicker sky={sky} boughtTiers={boughtTiers} onClose={close} />}
    </>
  );
};
