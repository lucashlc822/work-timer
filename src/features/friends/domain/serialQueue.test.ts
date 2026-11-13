import { describe, expect, it } from 'vitest';

import { serialQueue } from './serialQueue';

/** A job whose completion the test controls, and which records when it starts and ends. */
const controlled = (name: string, log: string[]) => {
  let finish!: () => void;
  let fail!: (error: Error) => void;
  const done = new Promise<string>((resolve, reject) => {
    finish = () => resolve(name);
    fail = reject;
  });
  return {
    job: () => {
      log.push(`start ${name}`);
      return done.finally(() => log.push(`end ${name}`));
    },
    finish,
    fail,
  };
};

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('serialQueue', () => {
  it('does not start a job until the one before it has finished, even if the first is slow', async () => {
    const log: string[] = [];
    const queue = serialQueue();
    const slow = controlled('focus', log);
    const fast = controlled('break', log);

    const first = queue(slow.job);
    const second = queue(fast.job);
    await settle();
    // Only the first has left; the second waits behind it.
    expect(log).toEqual(['start focus']);

    // Releasing the second early changes nothing: it hasn't started.
    fast.finish();
    await settle();
    expect(log).toEqual(['start focus']);

    slow.finish();
    await Promise.all([first, second]);
    expect(log).toEqual(['start focus', 'end focus', 'start break', 'end break']);
  });

  it('hands back what its job returns', async () => {
    const queue = serialQueue();
    await expect(queue(() => Promise.resolve(42))).resolves.toBe(42);
  });

  it('rejects only the failing job, and still runs the ones behind it', async () => {
    const log: string[] = [];
    const queue = serialQueue();
    const bad = controlled('bad', log);
    const good = controlled('good', log);

    const first = queue(bad.job);
    const second = queue(good.job);
    const firstOutcome = expect(first).rejects.toThrow('offline');
    bad.fail(new Error('offline'));
    await firstOutcome;

    good.finish();
    await expect(second).resolves.toBe('good');
    expect(log).toEqual(['start bad', 'end bad', 'start good', 'end good']);
  });

  it('runs a job queued after everything has finished straight away', async () => {
    const queue = serialQueue();
    await queue(() => Promise.resolve());
    await settle();
    await expect(queue(() => Promise.resolve('late'))).resolves.toBe('late');
  });
});
