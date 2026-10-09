import type { TagColor } from '@/shared/db';
import { TAG_COLORS, tagColorVar } from '@/shared/ui';

/** The palette as a row of selectable dots. */
export const ColorSwatches = ({
  value,
  onChange,
  label,
}: {
  value: TagColor;
  onChange: (color: TagColor) => void;
  label: string;
}) => (
  <div role="radiogroup" aria-label={label} className="flex items-center gap-1.5">
    {TAG_COLORS.map((color) => (
      <button
        key={color}
        type="button"
        role="radio"
        aria-checked={color === value}
        aria-label={color}
        onClick={() => onChange(color)}
        className={`h-5 w-5 rounded-full border-2 transition-colors ${
          color === value ? 'border-ink-primary' : 'hover:border-ink-muted border-transparent'
        }`}
        style={{ backgroundColor: tagColorVar(color) }}
      />
    ))}
  </div>
);
