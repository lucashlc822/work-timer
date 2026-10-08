import { useState } from 'react';

import {
  clampCustomMinutes,
  CUSTOM_MAX_MINUTES,
  CUSTOM_MIN_MINUTES,
  CUSTOM_STEP_MINUTES,
  DEV_PRESET_MINUTES,
  PRESET_MINUTES,
} from '../domain/durations';

/**
 * Preset lengths in one click, plus a custom slider.
 *
 * The dev-only 1- and 2-minute presets exist so acceptance tests finish in minutes;
 * `import.meta.env.DEV` is false in every production build, so it never ships.
 */
const presets: readonly number[] = import.meta.env.DEV
  ? [...DEV_PRESET_MINUTES, ...PRESET_MINUTES]
  : PRESET_MINUTES;

interface Props {
  minutes: number;
  onChange: (minutes: number) => void;
  disabled?: boolean;
}

export const DurationPicker = ({ minutes, onChange, disabled = false }: Props) => {
  const [custom, setCustom] = useState(!presets.includes(minutes));

  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-4">
      <div
        role="radiogroup"
        aria-label="Session length"
        className="flex flex-wrap justify-center gap-2"
      >
        {presets.map((preset) => (
          <Pill
            key={preset}
            selected={!custom && minutes === preset}
            disabled={disabled}
            onClick={() => {
              setCustom(false);
              onChange(preset);
            }}
          >
            {preset} min{(DEV_PRESET_MINUTES as readonly number[]).includes(preset) && ' (dev)'}
          </Pill>
        ))}
        <Pill
          selected={custom}
          disabled={disabled}
          onClick={() => {
            setCustom(true);
            onChange(clampCustomMinutes(minutes));
          }}
        >
          Custom
        </Pill>
      </div>

      {custom && (
        <label className="flex w-full flex-col items-center gap-2">
          <span className="text-ink-secondary text-sm">
            <span className="text-ink-primary font-mono">{minutes}</span> minutes
          </span>
          <input
            type="range"
            min={CUSTOM_MIN_MINUTES}
            max={CUSTOM_MAX_MINUTES}
            step={CUSTOM_STEP_MINUTES}
            value={minutes}
            disabled={disabled}
            onChange={(e) => onChange(clampCustomMinutes(Number(e.target.value)))}
            className="accent-lavender-400 w-full"
            aria-label="Custom session length in minutes"
          />
        </label>
      )}
    </div>
  );
};

export const Pill = ({
  selected,
  disabled,
  onClick,
  children,
}: {
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    role="radio"
    aria-checked={selected}
    disabled={disabled}
    onClick={onClick}
    className={`rounded-pill border px-4 py-1.5 text-sm transition-colors disabled:opacity-50 ${
      selected
        ? 'border-lavender-400 bg-lavender-400/15 text-ink-primary'
        : 'border-night-600 text-ink-secondary hover:border-lavender-400 hover:text-ink-primary'
    }`}
  >
    {children}
  </button>
);
