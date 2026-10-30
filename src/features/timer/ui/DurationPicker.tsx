import { useState } from 'react';

import {
  clampCustomMinutes,
  CUSTOM_MAX_MINUTES,
  CUSTOM_MIN_MINUTES,
  CUSTOM_STEP_MINUTES,
  DEV_PRESET_MINUTES,
  PRESET_MINUTES,
} from '../domain/durations';
import { SegmentedControl } from './SegmentedControl';

/** The "Custom" segment's value; every other segment's is its minutes. */
const CUSTOM = 'custom';

/**
 * Preset lengths in one click, plus a custom slider.
 *
 * The dev-only 1- and 2-minute presets exist so acceptance tests finish in minutes;
 * `import.meta.env.DEV` is false in every production build, so it never ships.
 */
const presets: readonly number[] = import.meta.env.DEV
  ? [...DEV_PRESET_MINUTES, ...PRESET_MINUTES]
  : PRESET_MINUTES;

/**
 * Even rows at any width: the dev presets make six segments (two rows of
 * three); production's four are two rows of two until `sm`, then one row.
 */
const LENGTH_LAYOUT =
  presets.length > 3
    ? 'rounded-soft grid grid-cols-3'
    : 'rounded-soft grid grid-cols-2 sm:grid-cols-4';

interface Props {
  minutes: number;
  onChange: (minutes: number) => void;
  disabled?: boolean;
}

export const DurationPicker = ({ minutes, onChange, disabled = false }: Props) => {
  const [custom, setCustom] = useState(!presets.includes(minutes));

  const options: { value: number | typeof CUSTOM; label: string }[] = [
    ...presets.map((preset) => ({
      value: preset,
      label: `${preset} min${(DEV_PRESET_MINUTES as readonly number[]).includes(preset) ? ' (dev)' : ''}`,
    })),
    { value: CUSTOM, label: 'Custom' },
  ];

  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-4">
      <SegmentedControl
        label="Session length"
        layout={LENGTH_LAYOUT}
        options={options}
        value={custom ? CUSTOM : minutes}
        disabled={disabled}
        onChange={(choice) => {
          if (choice === CUSTOM) {
            setCustom(true);
            onChange(clampCustomMinutes(minutes));
          } else {
            setCustom(false);
            onChange(choice);
          }
        }}
      />

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
            className="range-soft w-full"
            aria-label="Custom session length in minutes"
          />
        </label>
      )}
    </div>
  );
};
