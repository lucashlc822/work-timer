import { useRef, type KeyboardEvent } from 'react';

import type { PeriodKind } from '../domain/period';
import { PERIOD_PANEL_ID, periodTabId } from './periodTabIds';

const KINDS: ReadonlyArray<{ kind: PeriodKind; label: string }> = [
  { kind: 'week', label: 'Week' },
  { kind: 'month', label: 'Month' },
  { kind: 'all', label: 'All time' },
];

/**
 * Week / Month / All time as a proper tab list: the selected tab is the one
 * Tab stop, the arrow keys move between tabs (wrapping), and Home and End jump
 * to the ends. Selection follows focus, since switching is cheap.
 */
export const PeriodTabs = ({
  kind,
  onChange,
}: {
  kind: PeriodKind;
  onChange: (next: PeriodKind) => void;
}) => {
  const tabs = useRef<Partial<Record<PeriodKind, HTMLButtonElement | null>>>({});

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = KINDS.length - 1;
    const target =
      e.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : e.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : null;
    if (target === null) return;
    e.preventDefault();
    const next = KINDS[target]!.kind;
    onChange(next);
    tabs.current[next]?.focus();
  };

  return (
    <div role="tablist" aria-label="Period" className="flex gap-2">
      {KINDS.map(({ kind: k, label }, index) => (
        <button
          key={k}
          ref={(el) => {
            tabs.current[k] = el;
          }}
          id={periodTabId(k)}
          type="button"
          role="tab"
          aria-selected={k === kind}
          aria-controls={PERIOD_PANEL_ID}
          tabIndex={k === kind ? 0 : -1}
          onClick={() => onChange(k)}
          onKeyDown={(e) => onKeyDown(e, index)}
          className={`rounded-pill border px-4 py-1.5 text-xs transition-colors ${
            k === kind
              ? 'border-lavender-400 text-ink-primary'
              : 'border-night-600 text-ink-secondary hover:border-lavender-400'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
};
