import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  announceArrival,
  arrivalPath,
  currentArrival,
  FLIGHT_CLEARANCE,
  subscribeArrival,
} from './arrival';

afterEach(() => announceArrival(null));

const box = { x: 100, y: 100, width: 80, height: 80 };

describe('arrivalPath', () => {
  it('flies to a place clearly outside the result’s star', () => {
    expect(arrivalPath(box, [300, 140])).toBe('fly');
    expect(arrivalPath(box, [140, 100 - FLIGHT_CLEARANCE - 1])).toBe('fly');
  });

  it('lights in place behind the result’s star, or near it', () => {
    expect(arrivalPath(box, [140, 140])).toBe('in-place');
    expect(arrivalPath(box, [100 - FLIGHT_CLEARANCE, 140])).toBe('in-place');
  });

  it('lights in place when the result’s star couldn’t be measured', () => {
    expect(arrivalPath(null, [900, 900])).toBe('in-place');
  });
});

describe('the arrival store', () => {
  it('tells its listeners when a star arrives and when it goes', () => {
    const heard = vi.fn();
    const stop = subscribeArrival(heard);
    const arrival = { sessionId: 's1', from: box, instant: false };

    announceArrival(arrival);
    expect(currentArrival()).toBe(arrival);
    announceArrival(arrival);
    expect(heard).toHaveBeenCalledTimes(1);

    announceArrival(null);
    expect(currentArrival()).toBeNull();
    expect(heard).toHaveBeenCalledTimes(2);

    stop();
    announceArrival(arrival);
    expect(heard).toHaveBeenCalledTimes(2);
  });
});
