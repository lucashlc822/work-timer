import type { TagColor } from '@/shared/db';
import { tagColorVar } from '@/shared/ui';

/** A small filled circle in a tag's colour. Decorative: the name is always beside it. */
export const TagDot = ({ color }: { color: TagColor }) => (
  <span
    aria-hidden="true"
    className="rounded-pill inline-block h-2.5 w-2.5 shrink-0"
    style={{ backgroundColor: tagColorVar(color) }}
  />
);
