import { afterEach, describe, expect, it } from 'vitest';

import { createDb, META_KEYS, readMeta, type WorkTimerDb } from '@/shared/db';

import { itemByKey, ownedKeys, ownedPackKeys } from '../domain/catalogue';
import {
  buy,
  readBalance,
  readEquippedTheme,
  readOwned,
  setEquippedTheme,
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

const fund = (db: WorkTimerDb, amount: number) => {
  const id = crypto.randomUUID();
  return db.ledger.add({
    id,
    reason: 'session',
    delta: amount,
    ref: id,
    createdAt: NOW - 1,
    syncedAt: null,
  });
};
const price = (key: string): number => itemByKey(key)?.price ?? NaN;

describe('themes and packs in the shop', () => {
  it('sell themes at 1,200 and packs at 800, with night free', () => {
    expect(price('theme.dusk')).toBe(1200);
    expect(price('theme.tide')).toBe(1200);
    expect(price('theme.bloom')).toBe(1200);
    expect(price('pack.woodland')).toBe(800);
    expect(price('pack.harbour')).toBe(800);
    expect(price('theme.night')).toBe(0);
  });

  it('buys a theme and a pack like any other item, once each', async () => {
    const db = newDb();
    await fund(db, 3000);

    expect(await buy(db, USER, 'theme.dusk', NOW)).toEqual({ ok: true });
    expect(await buy(db, USER, 'pack.woodland', NOW)).toEqual({ ok: true });
    expect(await buy(db, USER, 'theme.dusk', NOW)).toEqual({ ok: false, reason: 'owned' });
    expect(await buy(db, USER, 'pack.woodland', NOW)).toEqual({ ok: false, reason: 'owned' });
    expect(await buy(db, USER, 'theme.night', NOW)).toEqual({ ok: false, reason: 'free' });

    expect(await readBalance(db)).toBe(3000 - 1200 - 800);
    const owned = await readOwned(db);
    expect(owned.has('theme.dusk') && owned.has('pack.woodland') && owned.has('theme.night')).toBe(
      true,
    );
  });

  it('refuses a theme the balance cannot cover', async () => {
    const db = newDb();
    await fund(db, 1199);
    expect(await buy(db, USER, 'theme.tide', NOW)).toEqual({ ok: false, reason: 'insufficient' });
  });

  it('derives the owned packs from purchases only', () => {
    expect([...ownedPackKeys(ownedKeys([]))]).toEqual([]);
    expect([...ownedPackKeys(ownedKeys([{ reason: 'purchase', ref: 'pack.harbour' }]))]).toEqual([
      'harbour',
    ]);
    // A theme purchase does not own a pack.
    expect([...ownedPackKeys(ownedKeys([{ reason: 'purchase', ref: 'theme.dusk' }]))]).toEqual([]);
  });
});

describe('equipping a sky theme', () => {
  it('is night until another is equipped', async () => {
    expect(await readEquippedTheme(newDb())).toBe('night');
  });

  it('equips an owned theme, stamps the synced settings, and can go back to night', async () => {
    const db = newDb();
    await fund(db, 2000);
    await buy(db, USER, 'theme.bloom', NOW);

    expect(await setEquippedTheme(db, 'bloom', NOW + 10)).toBe(true);
    expect(await readEquippedTheme(db)).toBe('bloom');
    expect(await readMeta<number>(db, META_KEYS.settingsUpdatedAt)).toBe(NOW + 10);

    expect(await setEquippedTheme(db, 'night', NOW + 20)).toBe(true);
    expect(await readEquippedTheme(db)).toBe('night');
  });

  it('refuses a theme that is not owned, changing nothing', async () => {
    const db = newDb();
    expect(await setEquippedTheme(db, 'tide', NOW)).toBe(false);
    expect(await readEquippedTheme(db)).toBe('night');
    expect(await readMeta(db, META_KEYS.settingsUpdatedAt)).toBeUndefined();
  });

  it('does not let a style purchase equip a theme of the same name', async () => {
    const db = newDb();
    await fund(db, 2000);
    await buy(db, USER, 'style.ember', NOW);
    expect(await setEquippedTheme(db, 'ember', NOW)).toBe(false);
  });
});
