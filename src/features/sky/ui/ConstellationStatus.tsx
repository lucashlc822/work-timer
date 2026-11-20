import { AnimatePresence } from 'motion/react';
import { useCallback, useState } from 'react';

import type { Tier } from '../domain/types';
import { useSky } from '../hooks/useSky';
import { ConstellationPicker } from './ConstellationPicker';

const aria = (prompt: boolean, label: string): string =>
  prompt ? label : `Building ${label}. Change constellation`;

/**
 * What is being built right now, and the way into the picker. Highlighted
 * when nothing is in progress, since every session until then wanders.
 */
export const ConstellationStatus = ({
  boughtTiers,
  ownedPacks,
  variant = 'pill',
}: {
  boughtTiers: ReadonlySet<Tier>;
  ownedPacks: ReadonlySet<string>;
  /**
   * 'pill' is the one-button form. 'glance' (the home page) says where the
   * constellation drawn above has got to: "The Kite · 4 of 7 stars · 3 to go",
   * with Change beside it; the button keeps the pill's accessible name.
   */
  variant?: 'pill' | 'glance';
}) => {
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

  const total = current === null ? 0 : current.def.shape.points.length;
  const left = current === null ? 0 : total - current.stars.length;
  const glance = variant === 'glance' && !prompt;
  const name = aria(prompt, label);

  return (
    <>
      {glance ? (
        <div className="text-ink-secondary flex items-baseline justify-center gap-3 text-xs">
          <span aria-hidden>
            <span className="font-atlas tracking-atlas text-ink-primary text-sm">
              {current.def.name}
            </span>
            {' · '}
            {current.stars.length} of {total} stars{left > 0 ? ` · ${left} to go` : ''}
          </span>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={name}
            className="text-lavender-200 hover:text-ink-primary inline-flex min-h-6 items-center px-1 underline-offset-4 hover:underline"
          >
            Change
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={name}
          className={`rounded-pill pressable border px-4 py-1.5 text-xs ${
            prompt
              ? 'border-lavender-400 bg-lavender-400/15 text-ink-primary hover:bg-lavender-400/25'
              : 'border-night-600 text-ink-secondary hover:border-lavender-400 hover:text-ink-primary'
          }`}
        >
          {label}
        </button>
      )}
      <AnimatePresence>
        {open && (
          <ConstellationPicker
            sky={sky}
            boughtTiers={boughtTiers}
            ownedPacks={ownedPacks}
            onClose={close}
          />
        )}
      </AnimatePresence>
    </>
  );
};
