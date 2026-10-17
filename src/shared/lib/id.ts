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
 * A UUID-shaped id derived from `key`: the same key always gives the same id,
 * on every device and every run.
 *
 * For records that describe a *fact* rather than an action — "Stardust earned
 * for session X", "the daily goal reached on 2026-10-20" — so that two devices
 * (or one device twice) recording the same fact produce the same row, and the
 * server's insert-only `on conflict do nothing` keeps one copy.
 *
 * The key must be unique across ALL users, because the id is the server's
 * primary key: include the account id. Synchronous on purpose (it runs inside
 * Dexie transactions, where awaiting Web Crypto would end the transaction).
 * cyrb128 is not cryptographic; it only has to make accidental collisions
 * between distinct keys vanishingly unlikely, which 128 bits does.
 */
export const stableId = (key: string): string => {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < key.length; i++) {
    const k = key.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;

  const hex = [h1, h2, h3, h4].map((h) => (h >>> 0).toString(16).padStart(8, '0')).join('');
  // Marked as an RFC 9562 version-8 ("custom") UUID with the standard variant,
  // so it is a valid uuid for Postgres and never mistaken for a random v4.
  const v = (parseInt(hex[16]!, 16) & 0x3) | 0x8;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${v.toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

/**
 * A session's visual seed.
 *
 * Kept separate from the record id so the two can diverge later — a user might
 * eventually reroll a star's appearance without the session changing identity.
 */
export const newSeed = (): string => newId().replaceAll('-', '').slice(0, 16);
