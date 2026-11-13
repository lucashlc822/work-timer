import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDb, type WorkTimerDb } from '@/shared/db';

import { CHIME_WINDOW_MS } from '../domain/moment';
import { chimeIfWanted, readCompletionSound, writeCompletionSound } from './completionSound';

const played = vi.hoisted(() => vi.fn(() => true));
vi.mock('@/shared/lib', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib')>()),
  playChime: played,
}));

const opened: WorkTimerDb[] = [];
const withDb = (): WorkTimerDb => {
  const db = createDb(`test-${crypto.randomUUID()}`);
  opened.push(db);
  return db;
};

beforeEach(() => played.mockClear());
afterEach(async () => {
  while (opened.length > 0) await opened.pop()?.delete();
});

describe('the completion sound setting', () => {
  it('is on until the device turns it off, and off persists (case 2)', async () => {
    const db = withDb();
    expect(await readCompletionSound(db)).toBe(true);
    await writeCompletionSound(db, false);
    expect(await readCompletionSound(db)).toBe(false);
    await writeCompletionSound(db, true);
    expect(await readCompletionSound(db)).toBe(true);
  });
});

describe('chimeIfWanted', () => {
  it('chimes by default for a moment that starts as the session ends (case 1)', async () => {
    await chimeIfWanted(withDb(), 1_000, 1_100);
    expect(played).toHaveBeenCalledTimes(1);
  });

  it('is silent with the switch off (case 2)', async () => {
    const db = withDb();
    await writeCompletionSound(db, false);
    await chimeIfWanted(db, 1_000, 1_100);
    expect(played).not.toHaveBeenCalled();
  });

  it('is silent for a moment that starts long after the end (case 3)', async () => {
    await chimeIfWanted(withDb(), 1_000, 1_001 + CHIME_WINDOW_MS);
    expect(played).not.toHaveBeenCalled();
    await chimeIfWanted(withDb(), 1_000, 1_000 + CHIME_WINDOW_MS);
    expect(played).toHaveBeenCalledTimes(1);
  });

  it('never throws, even with no store to read', async () => {
    const db = withDb();
    await db.delete();
    await expect(chimeIfWanted(db, 1_000, 1_100)).resolves.toBeUndefined();
  });
});
