/**
 * Friend codes (M7). The server issues them: six characters from an alphabet
 * without look-alikes (no 0/O, 1/I/L). Stored bare, shown as "K7Q-2MX".
 */

export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const VALID = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;

/** "K7Q2MX" → "K7Q-2MX". Anything else is returned as it came. */
export const formatCode = (code: string): string =>
  VALID.test(code) ? `${code.slice(0, 3)}-${code.slice(3)}` : code;

/**
 * What someone typed, as a code: spaces and hyphens dropped, upper-cased.
 * `null` unless it could be a real code, so an obvious typo is caught before
 * asking the server, which stays the authority on whether it exists.
 */
export const normalizeCode = (typed: string): string | null => {
  const bare = typed.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return VALID.test(bare) ? bare : null;
};
