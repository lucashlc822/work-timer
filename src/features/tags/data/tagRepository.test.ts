import { afterEach, describe, expect, it } from 'vitest';

import { createDb, type WorkTimerDb } from '@/shared/db';
import { createTestClock } from '@/shared/lib';

import {
  createTag,
  listTags,
  recolorTag,
  renameTag,
  setArchived,
  TagLimitError,
  TagNameInvalidError,
} from './tagRepository';

const opened: WorkTimerDb[] = [];
const withDb = (): WorkTimerDb => {
  const db = createDb(`test-${crypto.randomUUID()}`);
  opened.push(db);
  return db;
};
afterEach(async () => {
  while (opened.length > 0) await opened.pop()?.delete();
});

/** 'ok' if the promise resolves, else the rejection's reason. */
const outcomeOf = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
  } catch (e) {
    if (e instanceof TagNameInvalidError) return e.reason;
    if (e instanceof TagLimitError) return 'limit';
    throw e;
  }
  return 'ok';
};

describe('tagRepository', () => {
  // M4 case 1
  it('creates an active tag with equal created/updated times and lists it', async () => {
    const db = withDb();
    const tag = await createTag(db, { name: 'Writing', color: 'mint' }, createTestClock());
    expect(tag.archivedAt).toBeNull();
    expect(tag.createdAt).toBe(tag.updatedAt);
    expect(await listTags(db)).toEqual([tag]);
  });

  // M4 case 2
  it('rejects duplicate, empty, too-long names and the 21st active tag', async () => {
    const db = withDb();
    const clock = createTestClock();
    const first = await createTag(db, { name: 'Writing', color: 'mint' }, clock);
    expect(await outcomeOf(createTag(db, { name: 'writing ', color: 'rose' }, clock))).toBe(
      'duplicate',
    );
    expect(await outcomeOf(createTag(db, { name: '   ', color: 'rose' }, clock))).toBe('empty');
    expect(await outcomeOf(createTag(db, { name: 'x'.repeat(25), color: 'rose' }, clock))).toBe(
      'tooLong',
    );

    for (let i = 1; i < 20; i++) await createTag(db, { name: `t${i}`, color: 'rose' }, clock);
    expect(await outcomeOf(createTag(db, { name: 'one more', color: 'rose' }, clock))).toBe(
      'limit',
    );

    await setArchived(db, first.id, true, clock);
    expect(await outcomeOf(createTag(db, { name: 'Writing', color: 'mint' }, clock))).toBe('ok');
  });

  // M4 case 3
  it('rename and recolor bump updatedAt but keep id and createdAt', async () => {
    const db = withDb();
    const clock = createTestClock(1000);
    const tag = await createTag(db, { name: 'Writing', color: 'mint' }, clock);
    clock.advance(4000);
    await renameTag(db, tag.id, 'Essays', clock);
    clock.advance(1000);
    await recolorTag(db, tag.id, 'rose', clock);

    const [row] = await listTags(db);
    expect(row).toMatchObject({
      id: tag.id,
      name: 'Essays',
      color: 'rose',
      createdAt: 1000,
      updatedAt: 6000,
    });
  });

  it('renaming a tag to its own name in another case is allowed', async () => {
    const db = withDb();
    const clock = createTestClock();
    const tag = await createTag(db, { name: 'writing', color: 'mint' }, clock);
    await renameTag(db, tag.id, 'Writing', clock);
    expect((await listTags(db))[0]?.name).toBe('Writing');
  });

  it('refuses to restore an archived tag whose name was taken meanwhile', async () => {
    const db = withDb();
    const clock = createTestClock();
    const old = await createTag(db, { name: 'Writing', color: 'mint' }, clock);
    await setArchived(db, old.id, true, clock);
    await createTag(db, { name: 'Writing', color: 'rose' }, clock);
    expect(await outcomeOf(setArchived(db, old.id, false, clock))).toBe('duplicate');
  });

  // M5: every edit must be uploaded again.
  it('every edit clears syncedAt so sync uploads it', async () => {
    const db = withDb();
    const clock = createTestClock();
    const tag = await createTag(db, { name: 'Writing', color: 'mint' }, clock);
    const markSynced = () => db.tags.update(tag.id, { syncedAt: 1 });
    const synced = async () => (await listTags(db))[0]?.syncedAt;

    await markSynced();
    await renameTag(db, tag.id, 'Essays', clock);
    expect(await synced()).toBeNull();
    await markSynced();
    await recolorTag(db, tag.id, 'rose', clock);
    expect(await synced()).toBeNull();
    await markSynced();
    await setArchived(db, tag.id, true, clock);
    expect(await synced()).toBeNull();
    await markSynced();
    await setArchived(db, tag.id, false, clock);
    expect(await synced()).toBeNull();
  });
});
