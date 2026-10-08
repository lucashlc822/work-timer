import { POMODORO_LIMITS, type PomodoroLimits } from '../domain/pomodoro';
import type { PomodoroSettings } from '../domain/types';

interface Props {
  settings: PomodoroSettings;
  limits: PomodoroLimits;
  onChange: (settings: PomodoroSettings) => void;
  disabled?: boolean;
}

const ordinal = (n: number): string => {
  const suffix =
    n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th';
  return `${n}${suffix}`;
};

/** "25 min focus · 5 min breaks · 15 min after every 4th". */
const describeSettings = (s: PomodoroSettings): string =>
  `${s.focusS / 60} min focus · ${s.shortBreakS / 60} min breaks · ${s.longBreakS / 60} min after every ${ordinal(s.blocksPerLongBreak)}`;

/**
 * The four Pomodoro lengths as sliders. Minutes at the UI boundary, seconds in
 * the settings, like `DurationPicker`. Every value is snapped by the caller
 * (`clampPomodoroSettings`), so a slider can never produce an off-grid length.
 */
export const PomodoroSettingsPanel = ({ settings, limits, onChange, disabled = false }: Props) => {
  const field = (key: keyof PomodoroSettings, label: string, unit: 'min' | 'blocks') => {
    const range = limits[key];
    const scale = unit === 'min' ? 60 : 1;
    const value = settings[key] / scale;
    // Only the dev limits allow a value off the production grid (e.g. a
    // one-minute block); label it so it never looks like a real option.
    const prod = POMODORO_LIMITS[key];
    const devOnly = settings[key] < prod.min || (settings[key] - prod.min) % prod.step !== 0;
    return (
      <label key={key} className="flex w-full flex-col gap-1">
        <span className="text-ink-secondary flex justify-between text-sm">
          <span>{label}</span>
          <span>
            <span className="text-ink-primary font-mono">{value}</span>
            {unit === 'min' ? ' min' : ' blocks'}
            {devOnly && ' (dev)'}
          </span>
        </span>
        <input
          type="range"
          min={range.min / scale}
          max={range.max / scale}
          step={range.step / scale}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange({ ...settings, [key]: Number(e.target.value) * scale })}
          className="accent-lavender-400 w-full"
          aria-label={`${label}${unit === 'min' ? ' in minutes' : ''}`}
        />
      </label>
    );
  };

  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-3">
      {field('focusS', 'Focus', 'min')}
      {field('shortBreakS', 'Short break', 'min')}
      {field('longBreakS', 'Long break', 'min')}
      {field('blocksPerLongBreak', 'Long break every', 'blocks')}
      <p className="text-ink-muted text-xs">{describeSettings(settings)}</p>
    </div>
  );
};
