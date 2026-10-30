import type { ReactNode } from 'react';

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
 * on the idle screen. Each segment is a plain Tab stop, not an arrow-key
 * roving group, so the keyboard order is what the separate pills had.
 */
export const SegmentedControl = <T extends string | number>({
  label,
  options,
  value,
  onChange,
  disabled = false,
  layout = 'rounded-pill flex flex-wrap justify-center',
}: Props<T>) => (
  <div
    role="radiogroup"
    aria-label={label}
    className={`border-night-600 bg-night-900/60 gap-1 border p-1 ${layout}`}
  >
    {options.map((option) => {
      const selected = option.value === value;
      return (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={selected}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={`rounded-pill ease-gentle px-4 py-1.5 text-sm transition-colors duration-300 disabled:opacity-50 ${
            selected ? 'bg-night-600 text-ink-primary' : 'text-ink-secondary hover:text-ink-primary'
          }`}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);
