import type { SessionMode } from '@/shared/db';

import { SegmentedControl } from './SegmentedControl';

const MODES: { value: SessionMode; label: string }[] = [
  { value: 'countdown', label: 'Countdown' },
  { value: 'pomodoro', label: 'Pomodoro' },
];

interface Props {
  mode: SessionMode;
  onChange: (mode: SessionMode) => void;
  disabled?: boolean;
}

/** Countdown or Pomodoro, chosen on the idle screen and remembered. */
export const ModeToggle = ({ mode, onChange, disabled = false }: Props) => (
  <SegmentedControl
    label="Session type"
    options={MODES}
    value={mode}
    onChange={onChange}
    disabled={disabled}
  />
);
