// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { playChime } from './chime';

/** Records what the chime asks of Web Audio, and every context it opens. */
class FakeContext {
  static made: FakeContext[] = [];
  currentTime = 0;
  destination = {};
  closed = false;
  oscillators: { frequency: { value: number }; started: boolean }[] = [];
  constructor() {
    FakeContext.made.push(this);
  }
  createGain() {
    return {
      gain: {
        value: 1,
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };
  }
  createOscillator() {
    const osc = {
      type: '',
      frequency: { value: 0 },
      started: false,
      connect: vi.fn(),
      start: () => {
        osc.started = true;
      },
      stop: vi.fn(),
    };
    this.oscillators.push(osc);
    return osc;
  }
  resume() {
    return Promise.resolve();
  }
  close() {
    this.closed = true;
    return Promise.resolve();
  }
}

const activation = (hasBeenActive: boolean | undefined) =>
  vi.stubGlobal('navigator', {
    userActivation: hasBeenActive === undefined ? undefined : { hasBeenActive },
  });

beforeEach(() => {
  vi.useFakeTimers();
  FakeContext.made = [];
  vi.stubGlobal('AudioContext', FakeContext);
  window.AudioContext = FakeContext as unknown as typeof AudioContext;
  activation(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('playChime', () => {
  it('rings a bell of three partials and closes its context within 4 s (case 4)', () => {
    expect(playChime()).toBe(true);
    const [ctx] = FakeContext.made;
    expect(FakeContext.made).toHaveLength(1);
    expect(ctx!.oscillators.map((o) => o.frequency.value)).toEqual([880, 1320, 2430]);
    expect(ctx!.oscillators.every((o) => o.started)).toBe(true);
    expect(ctx!.closed).toBe(false);
    vi.advanceTimersByTime(4_000);
    expect(ctx!.closed).toBe(true);
  });

  it('makes no context before the page has had user activation (case 4)', () => {
    activation(false);
    expect(playChime()).toBe(false);
    expect(FakeContext.made).toHaveLength(0);
  });

  it('plays where the activation API is missing', () => {
    activation(undefined);
    expect(playChime()).toBe(true);
  });

  it('is silent, not an error, with no Web Audio', () => {
    window.AudioContext = undefined as unknown as typeof AudioContext;
    vi.stubGlobal('AudioContext', undefined);
    expect(playChime()).toBe(false);
  });

  it('never throws when audio fails', () => {
    class Broken {
      constructor() {
        throw new Error('no audio device');
      }
    }
    window.AudioContext = Broken as unknown as typeof AudioContext;
    expect(playChime()).toBe(false);
  });
});
