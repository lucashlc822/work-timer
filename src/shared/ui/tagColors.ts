import type { TagColor } from '@/shared/db';

/**
 * The tag palette. Rows store the key, so recolouring the palette in
 * `tokens.css` restyles every tag without touching any data.
 *
 * The order is the order new tags are offered colours in, and the order the
 * palette was checked in: adjacent pairs stay distinguishable under red-green
 * and blue-yellow colour blindness. The soft pastel look means individual
 * colours are lighter and less saturated than a strict chart palette would
 * allow, so a tag's colour is never the only thing identifying it — its name
 * is always printed beside the dot or bar.
 */
const VARS: Record<TagColor, string> = {
  lavender: 'var(--color-lavender-400)',
  mint: 'var(--color-mint-300)',
  rose: 'var(--color-rose-400)',
  gold: 'var(--color-tag-gold)',
  sky: 'var(--color-tag-sky)',
  peach: 'var(--color-tag-peach)',
};

export const TAG_COLORS: readonly TagColor[] = ['lavender', 'mint', 'rose', 'gold', 'sky', 'peach'];

export const tagColorVar = (color: TagColor): string => VARS[color];
