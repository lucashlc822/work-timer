import type { TagRow } from '@/shared/db';

export const MAX_TAG_NAME_LENGTH = 24;
export const MAX_ACTIVE_TAGS = 20;

export type TagNameError = 'empty' | 'tooLong' | 'duplicate';

/** Trim, and collapse inner whitespace runs so "a  b" and "a b" are one name. */
export const normalizeTagName = (raw: string): string => raw.trim().replace(/\s+/g, ' ');

const sameName = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/**
 * Why `raw` can't be a tag name, or null if it can. Uniqueness is among
 * non-archived tags only (an archived name is free to reuse), and `selfId`
 * excludes the tag being renamed from its own duplicate check.
 */
export const validateTagName = (
  raw: string,
  others: readonly TagRow[],
  selfId?: string,
): TagNameError | null => {
  const name = normalizeTagName(raw);
  if (name === '') return 'empty';
  if (name.length > MAX_TAG_NAME_LENGTH) return 'tooLong';
  const clash = others.some(
    (t) => t.archivedAt === null && t.id !== selfId && sameName(t.name, name),
  );
  return clash ? 'duplicate' : null;
};

export const TAG_NAME_MESSAGES: Record<TagNameError, string> = {
  empty: 'Give the tag a name.',
  tooLong: `Keep it to ${MAX_TAG_NAME_LENGTH} characters.`,
  duplicate: 'You already have a tag with that name.',
};
