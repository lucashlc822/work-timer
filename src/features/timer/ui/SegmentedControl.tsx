import { useRef, type KeyboardEvent, type ReactNode } from 'react';

import { radioKeyTarget } from '@/shared/ui';

interface Props<T extends string | number> {
  /** The radiogroup's accessible name: "Session type", "Session length". */
  label: string;
  options: readonly { value: T; label: ReactNode }[];
  /** Null when no segment is selected. */
  value: T | null;
  onChange: (value: T) => void;
  disabled?: boolean;
  /**
   * The track's layout and radius. The default is one pill-shaped row that
   * wraps; a control with many segments passes a grid and `rounded-soft`, so a
   * wrapped track keeps even rows instead of becoming a blob.
   */
  layout?: string;
}

/**
 * One track with a highlighted segment: the way to pick one of a few choices
 * on the idle screen. A radio group, so the selected segment is its one Tab
 * stop (the first, when none is selected) and the arrow keys move and select,
 * wrapping at the ends.
 */
export const SegmentedControl = <T extends string | number>({
  label,
  options,
  value,
  onChange,
  disabled = false,
  layout = 'rounded-pill flex flex-wrap justify-center',
}: Props<T>) => {
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const tabStop = options.some((o) => o.value === value) ? value : options[0]?.value;

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const target = radioKeyTarget(e.key, index, options.length);
    const next = target === null ? undefined : options[target];
    if (target === null || next === undefined) return;
    e.preventDefault();
    onChange(next.value);
    items.current[target]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`border-night-600 bg-night-900/60 gap-1 border p-1 ${layout}`}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              items.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={option.value === tabStop ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={`rounded-pill ease-gentle px-4 py-1.5 text-sm transition-colors duration-300 disabled:opacity-50 ${
              selected
                ? 'bg-night-600 text-ink-primary'
                : 'text-ink-secondary hover:text-ink-primary'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
};
