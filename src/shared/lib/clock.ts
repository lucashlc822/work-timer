/**
 * Time sources.
 *
 * The timer's single most important correctness rule is that elapsed time is
 * *computed from timestamps*, never accumulated by counting `setInterval`
 * ticks. Browsers throttle intervals in background tabs, and iOS freezes
 * JavaScript outright when an installed PWA is backgrounded — a tick-counting
 * timer silently under-reports every session it survives.
 *
 * Injecting the clock rather than calling `Date.now()` inline keeps the timer's
 * logic testable without fake timers, and gives us somewhere to cross-check
 * wall-clock time against a monotonic source.
 */

export interface Clock {
  /**
   * Wall-clock milliseconds since the Unix epoch.
   *
   * Survives suspension (this is how we recover elapsed time after iOS
   * unfreezes us), but can jump backwards or forwards if the device clock
   * changes — whether by NTP correction, a timezone-independent user edit, or
   * someone trying to fast-forward a session.
   */
  now(): number;

  /**
   * Monotonic milliseconds since the document was created.
   *
   * Immune to device clock changes, so disagreement between this and `now()`
   * is evidence the wall clock moved. It does not survive a reload, and its
   * behaviour across suspension is platform-dependent — so it corroborates
   * `now()` rather than replacing it.
   */
  monotonic(): number;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  monotonic: () => performance.now(),
};

/**
 * A manually advanced clock for tests.
 *
 * `advance` moves both sources together, the normal case. `skew` moves only
 * the wall clock, simulating a device clock change so tests can assert that
 * the timer notices.
 */
export interface TestClock extends Clock {
  advance(ms: number): void;
  skew(ms: number): void;
}

export const createTestClock = (startEpochMs = 1_700_000_000_000): TestClock => {
  let wall = startEpochMs;
  let mono = 0;

  return {
    now: () => wall,
    monotonic: () => mono,
    advance(ms) {
      wall += ms;
      mono += ms;
    },
    skew(ms) {
      wall += ms;
    },
  };
};
