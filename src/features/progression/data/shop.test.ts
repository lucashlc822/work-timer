import { afterEach, describe, expect, it } from 'vitest';

import { createDb, META_KEYS, readMeta, type WorkTimerDb } from '@/shared/db';
import { createTestClock, stableId } from '@/shared/lib';
import { createSyncEngine } from '@/shared/sync';
import { FakeRemote } from '@/shared/sync/fakeRemote';

import { boughtTiers, itemByKey, ownedKeys } from '../domain/catalogue';
import { purchaseKey } from '../domain/reconcile';
import {
  buy,
  readBalance,
  readEquippedStyle,
  readOwned,
  setEquippedStyle,
} from './ledgerRepository';

const opened: WorkTimerDb[] = [];
const newDb = (): WorkTimerDb => {
  const db = createDb(`test-${crypto.randomUUID()}`);
  opened.push(db);
  return db;
};
afterEach(async () => {
  while (opened.length > 0) await opened.pop()?.delete();
});

const NOW = Date.parse('2026-10-18T09:00:00.000Z');
const USER = '11111111-1111-4111-8111-111111111111';

/** Give the account `amount` Stardust, as a ledger row. */
const fund = (db: WorkTimerDb, amount: number, id = crypto.randomUUID()) =>
  db.ledger.add({
    id,
    reason: 'session',
    delta: amount,
    ref: id,
    createdAt: NOW - 1,
    syncedAt: null,
  });

const price = (key: string): number => itemByKey(key)?.price ?? NaN;

// Case 7
describe('buy', () => {
  it('deducts the price in one negative ledger row, and the item becomes owned', async () => {
    const db = newDb();
    await fund(db, 1000);

    expect(await buy(db, USER, 'style.ember', NOW)).toEqual({ ok: true });

    expect(await readBalance(db)).toBe(1000 - price('style.ember'));
    const rows = (await db.ledger.toArray()).filter((r) => r.reason === 'purchase');
    expect(rows).toEqual([
      {
        id: stableId(purchaseKey(USER, 'style.ember')),
        reason: 'purchase',
        delta: -price('style.ember'),
        ref: 'style.ember',
        createdAt: NOW,
        syncedAt: null,
      },
    ]);
    expect((await readOwned(db)).has('style.ember')).toBe(true);
  });

  it('refuses to buy the same item twice, and charges once', async () => {
    const db = newDb();
    await fund(db, 2000);
    await buy(db, USER, 'style.ember', NOW);

    expect(await buy(db, USER, 'style.ember', NOW + 1)).toEqual({ ok: false, reason: 'owned' });
    expect(await readBalance(db)).toBe(2000 - price('style.ember'));
  });

  it('a double click is one purchase', async () => {
    const db = newDb();
    await fund(db, 2000);
    const results = await Promise.all([
      buy(db, USER, 'style.aurora', NOW),
      buy(db, USER, 'style.aurora', NOW),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await readBalance(db)).toBe(2000 - price('style.aurora'));
  });

  it('refuses when the balance is short, and writes nothing', async () => {
    const db = newDb();
    await fund(db, price('style.crystal') - 1);

    expect(await buy(db, USER, 'style.crystal', NOW)).toEqual({
      ok: false,
      reason: 'insufficient',
    });
    expect(await db.ledger.count()).toBe(1);
  });

  it('can spend the balance to exactly zero', async () => {
    const db = newDb();
    await fund(db, price('style.ember'));
    expect(await buy(db, USER, 'style.ember', NOW)).toEqual({ ok: true });
    expect(await readBalance(db)).toBe(0);
  });

  it('refuses an unknown item and a free one', async () => {
    const db = newDb();
    await fund(db, 5000);
    expect(await buy(db, USER, 'style.nope', NOW)).toEqual({ ok: false, reason: 'unknown' });
    expect(await buy(db, USER, 'style.classic', NOW)).toEqual({ ok: false, reason: 'free' });
    expect(await db.ledger.count()).toBe(1);
  });

  it('is impossible to buy twice from two offline devices: one deduction after syncing', async () => {
    const remote = new FakeRemote();
    const device = () => {
      const db = newDb();
      const engine = createSyncEngine({
        db,
        remote,
        clock: createTestClock(NOW + 3_600_000),
        lock: null,
        appVersion: '0.2.0',
      });
      return { db, engine };
    };
    const a = device();
    const b = device();
    // The same earning reaches both (as it would, reconciled from one session).
    const earning = crypto.randomUUID();
    await fund(a.db, 1000, earning);
    await fund(b.db, 1000, earning);

    await buy(a.db, USER, 'style.ember', NOW);
    await buy(b.db, USER, 'style.ember', NOW + 5);
    await a.engine.syncNow();
    await b.engine.syncNow();
    await a.engine.syncNow();

    expect(remote.tables.ledger.size).toBe(2); // the earning and one purchase
    expect(await readBalance(a.db)).toBe(1000 - price('style.ember'));
    expect(await readBalance(b.db)).toBe(1000 - price('style.ember'));
  });

  it('keeps one account from spending on another: ids differ per user', async () => {
    const dbA = newDb();
    const dbB = newDb();
    await fund(dbA, 1000);
    await fund(dbB, 1000);
    await buy(dbA, USER, 'style.ember', NOW);
    await buy(dbB, '22222222-2222-4222-8222-222222222222', 'style.ember', NOW);
    const [a] = (await dbA.ledger.toArray()).filter((r) => r.reason === 'purchase');
    const [b] = (await dbB.ledger.toArray()).filter((r) => r.reason === 'purchase');
    expect(a?.id).not.toBe(b?.id);
  });
});

// Case 7
describe('owned', () => {
  it('is the free defaults plus every purchase, and nothing else', async () => {
    const db = newDb();
    expect([...(await readOwned(db))]).toEqual(['style.classic']);

    await fund(db, 10_000);
    await buy(db, USER, 'style.prism', NOW);
    await buy(db, USER, 'tier.medium', NOW);
    expect([...(await readOwned(db))].sort()).toEqual(
      ['style.classic', 'style.prism', 'tier.medium'].sort(),
    );
  });

  it('is derived from purchase rows only: a negative non-purchase row owns nothing', () => {
    const owned = ownedKeys([
      { reason: 'session', ref: 'style.ember' },
      { reason: 'purchase', ref: null },
      { reason: 'purchase', ref: 'style.aurora' },
    ]);
    expect(owned.has('style.ember')).toBe(false);
    expect(owned.has('style.aurora')).toBe(true);
  });

  it('maps bought tier items to tiers', () => {
    expect([...boughtTiers(new Set(['style.classic', 'tier.hard']))]).toEqual(['hard']);
    expect([...boughtTiers(new Set(['style.classic']))]).toEqual([]);
  });

  it('prices tiers steeply: medium 2,000 and hard 6,000', () => {
    expect(price('tier.medium')).toBe(2000);
    expect(price('tier.hard')).toBe(6000);
  });
});

describe('equipping a star style', () => {
  it('is classic until another is equipped', async () => {
    expect(await readEquippedStyle(newDb())).toBe('classic');
  });

  it('equips an owned style, and stamps the synced settings', async () => {
    const db = newDb();
    await fund(db, 1000);
    await buy(db, USER, 'style.ember', NOW);

    expect(await setEquippedStyle(db, 'ember', NOW + 10)).toBe(true);
    expect(await readEquippedStyle(db)).toBe('ember');
    expect(await readMeta<number>(db, META_KEYS.settingsUpdatedAt)).toBe(NOW + 10);

    expect(await setEquippedStyle(db, 'classic', NOW + 20)).toBe(true);
    expect(await readEquippedStyle(db)).toBe('classic');
  });

  it('refuses a style that is not owned, changing nothing', async () => {
    const db = newDb();
    expect(await setEquippedStyle(db, 'crystal', NOW)).toBe(false);
    expect(await readEquippedStyle(db)).toBe('classic');
    expect(await readMeta(db, META_KEYS.settingsUpdatedAt)).toBeUndefined();
  });
});
