import { useRef, type KeyboardEvent } from 'react';

import type { TagColor } from '@/shared/db';
import { radioKeyTarget, TAG_COLORS, tagColorVar } from '@/shared/ui';

/**
 * The palette as a row of selectable dots. A radio group: the chosen dot is
 * the one Tab stop and the arrow keys move and choose, wrapping at the ends.
 */
export const ColorSwatches = ({
  value,
  onChange,
  label,
}: {
  value: TagColor;
  onChange: (color: TagColor) => void;
  label: string;
}) => {
  const dots = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const target = radioKeyTarget(e.key, index, TAG_COLORS.length);
    const next = target === null ? undefined : TAG_COLORS[target];
    if (target === null || next === undefined) return;
    e.preventDefault();
    onChange(next);
    dots.current[target]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={label} className="-m-0.5 flex items-center gap-0.5">
      {TAG_COLORS.map((color, index) => (
        <button
          key={color}
          ref={(el) => {
            dots.current[index] = el;
          }}
          type="button"
          role="radio"
          aria-checked={color === value}
          aria-label={color}
          tabIndex={color === value ? 0 : -1}
          onClick={() => onChange(color)}
          onKeyDown={(e) => onKeyDown(e, index)}
          // A 24px target around a 20px dot, so the dots sit where they did.
          className="group grid size-6 place-items-center"
        >
          <span
            className={`rounded-pill h-5 w-5 border-2 transition-colors ${
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
};
