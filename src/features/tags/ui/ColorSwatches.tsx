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
  <div role="radiogroup" aria-label={label} className="-m-0.5 flex items-center gap-0.5">
    {TAG_COLORS.map((color) => (
      <button
        key={color}
        type="button"
        role="radio"
        aria-checked={color === value}
        aria-label={color}
        onClick={() => onChange(color)}
        // A 24px target around a 20px dot, so the dots sit where they did.
        className="group grid size-6 place-items-center"
      >
        <span
          className={`h-5 w-5 rounded-pill border-2 transition-colors ${
            color === value
              ? 'border-ink-primary'
              : 'group-hover:border-ink-muted border-transparent'
          }`}
          style={{ backgroundColor: tagColorVar(color) }}
        />
      </button>
    ))}
  </div>
);
