import type { SessionMode } from '@/shared/db';

import { Pill } from './DurationPicker';

const MODES: { mode: SessionMode; label: string }[] = [
  { mode: 'countdown', label: 'Countdown' },
  { mode: 'pomodoro', label: 'Pomodoro' },
];

interface Props {
  mode: SessionMode;
  onChange: (mode: SessionMode) => void;
  disabled?: boolean;
}

/** Countdown or Pomodoro, chosen on the idle screen and remembered. */
export const ModeToggle = ({ mode, onChange, disabled = false }: Props) => (
  <div role="radiogroup" aria-label="Session type" className="flex justify-center gap-2">
    {MODES.map((m) => (
      <Pill
        key={m.mode}
        selected={mode === m.mode}
        disabled={disabled}
        onClick={() => onChange(m.mode)}
      >
        {m.label}
      </Pill>
    ))}
  </div>
);
