/**
 * Runs async jobs strictly one after another, in the order they were queued.
 *
 * A status that changes twice within one request's latency (a block starts
 * and ends, a session is started and ended at once) would otherwise have two
 * uploads in flight with nothing deciding which lands last; the older one
 * could overwrite the newer on the server. Queued, the second does not leave
 * until the first has finished.
 *
 * A job that fails rejects its own promise only: the jobs behind it still run.
 */
export const serialQueue = () => {
  let tail: Promise<void> = Promise.resolve();
  return <T>(job: () => Promise<T>): Promise<T> => {
    const run = tail.then(job);
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
};
