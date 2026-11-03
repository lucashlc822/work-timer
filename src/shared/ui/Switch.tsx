/**
 * An on/off switch drawn over a native checkbox, which stays the control: to
 * the keyboard, screen readers and tests it is a checkbox named `label`.
 */
export const Switch = ({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) => (
  <label className="text-ink-secondary hover:text-ink-primary flex cursor-pointer items-center justify-between gap-3 transition-colors has-disabled:cursor-default has-disabled:opacity-60">
    {label}
    {/* The input is transparent and fills the track, so it is what a click
        lands on (a hidden input under the label can't be clicked directly). */}
    <span className="relative h-5 w-9 shrink-0">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
      />
      <span
        aria-hidden
        className="bg-night-600 peer-checked:bg-lavender-400 peer-focus-visible:outline-lavender-300 ease-gentle rounded-pill after:bg-ink-primary after:rounded-pill pointer-events-none absolute inset-0 transition-colors duration-300 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 after:absolute after:top-0.5 after:left-0.5 after:h-4 after:w-4 after:transition-transform after:duration-300 peer-checked:after:translate-x-4"
      />
    </span>
  </label>
);
