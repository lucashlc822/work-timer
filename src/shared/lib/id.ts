/**
 * Identifier generation.
 *
 * Every persisted record gets its id on the client, before it has ever seen a
 * server. That is what makes offline-first sync tractable later: records have
 * stable identity from the moment they are created, so replaying a sync
 * outbox is idempotent — a retried upload collides on the primary key instead
 * of inserting a duplicate.
 */

/**
 * `crypto.randomUUID` is only exposed in secure contexts. Production always
 * qualifies (HTTPS, or localhost during development), but the fallback keeps
 * the app working if it is ever served over plain HTTP on a LAN address — a
 * realistic case when testing on a phone against a dev server.
 */
export const newId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x40; // version 4
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80; // RFC 4122 variant

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

/**
 * A session's visual seed.
 *
 * Kept separate from the record id so the two can diverge later — a user might
 * eventually reroll a star's appearance without the session changing identity.
 */
export const newSeed = (): string => newId().replaceAll('-', '').slice(0, 16);
