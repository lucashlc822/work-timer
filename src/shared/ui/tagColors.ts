import type { TagColor } from '@/shared/db';

/**
 * The tag palette. Rows store the key, so recolouring the palette in
 * `tokens.css` restyles every tag without touching any data.
 */
const VARS: Record<TagColor, string> = {
  lavender: 'var(--color-lavender-300)',
  rose: 'var(--color-rose-300)',
  mint: 'var(--color-mint-300)',
  warm: 'var(--color-star-warm)',
  cool: 'var(--color-star-cool)',
  blush: 'var(--color-rose-200)',
};

export const TAG_COLORS: readonly TagColor[] = [
  'lavender',
  'rose',
  'mint',
  'warm',
  'cool',
  'blush',
];

export const tagColorVar = (color: TagColor): string => VARS[color];
