// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ambientField, LAYER_DRIFT } from '../domain/ambient';
import { milkyWay, PARALLAX_PX } from '../domain/livingSky';
import { AmbientCanvas, type AmbientMotion } from './AmbientCanvas';

/**
 * jsdom draws nothing, so give every canvas a surface that records what it was
 * asked to do, and drive the frame loop by hand: a clock we move, and frames we
 * run. That is enough to ask the real questions: what is painted once, what is
 * drawn every frame, and what only happens in the living sky.
 */
type Calls = Record<string, unknown[][]>;
const surfaces = new Map<HTMLCanvasElement, Calls>();

const fakeContext = (calls: Calls, canvas: HTMLCanvasElement) =>
  new Proxy(
    {},
    {
      get: (_target, name: string) => {
        if (name === 'createLinearGradient' || name === 'createRadialGradient') {
          return (...args: unknown[]) => {
            (calls[name] ??= []).push(args);
            return { addColorStop: () => {} };
          };
        }
        if (name === 'getImageData') {
          return (...args: unknown[]) => {
            (calls[name] ??= []).push(args);
            return { data: new Uint8ClampedArray(canvas.width * canvas.height * 4) };
          };
        }
        return (...args: unknown[]) => {
          (calls[name] ??= []).push(args);
        };
      },
      set: () => true,
    },
  );

class FixedSizeObserver {
  private readonly callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe() {
    this.callback([{ contentRect: { width: 1000, height: 700 } } as ResizeObserverEntry], this);
  }
  unobserve() {}
  disconnect() {}
}

let now = 0;
let queue: FrameRequestCallback[] = [];
let reduced = false;

/** Move the clock on by `ms` and run the frame that was waiting. */
const step = (ms: number) => {
  now += ms;
  const waiting = queue;
  queue = [];
  act(() => waiting.forEach((callback) => callback(now)));
};
/** Run frames of `every` ms until the clock reaches `until`. */
const runTo = (until: number, every = 250) => {
  while (now < until) step(every);
};

beforeEach(() => {
  now = 0;
  queue = [];
  reduced = false;
  surfaces.clear();
  vi.stubGlobal('ResizeObserver', FixedSizeObserver);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    queue.push(callback);
    return queue.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  vi.stubGlobal('matchMedia', () => ({
    matches: reduced,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    const calls: Calls = surfaces.get(this) ?? {};
    surfaces.set(this, calls);
    return fakeContext(calls, this) as unknown as CanvasRenderingContext2D;
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const mount = (motion: AmbientMotion, themeKey?: string) => {
  const result = render(<AmbientCanvas themeKey={themeKey} motion={motion} />);
  const visible = result.container.querySelector('canvas')!;
  const nebula = [...surfaces.keys()].find((c) => c !== visible)!;
  const count = (canvas: HTMLCanvasElement, name: string) =>
    surfaces.get(canvas)?.[name]?.length ?? 0;
  return { ...result, visible, nebula, count };
};

describe('the Milky Way in the ambient sky', () => {
  it.each(['calm', 'living'] as const)(
    'is painted once into the nebula in %s mode: its clouds and its grains',
    (motion) => {
      const { nebula, count } = mount(motion);
      const clouds = ambientField().nebula.length + milkyWay().puffs.length;
      expect(count(nebula, 'createRadialGradient')).toBe(clouds);
      expect(count(nebula, 'arc')).toBe(milkyWay().grain.length);
    },
  );

  it('is painted in the theme own colours, and in the same places', () => {
    const night = mount('calm');
    const nightFills = night.count(night.nebula, 'fillRect');
    cleanup();
    surfaces.clear();
    const dusk = mount('calm', 'dusk');
    // Same band: the same number of clouds and grains, and the same number of fills.
    expect(dusk.count(dusk.nebula, 'arc')).toBe(milkyWay('dusk').grain.length);
    expect(dusk.count(dusk.nebula, 'fillRect')).toBeGreaterThanOrEqual(nightFills);
  });

  it('adds no work to a frame: the same drawing calls with the band or not behind a timer', () => {
    const { visible, count } = mount('calm');
    step(50);
    // A frame blits the one nebula and draws the stars; there is nothing band-shaped in it.
    expect(count(visible, 'drawImage')).toBe(1);
    expect(count(visible, 'createRadialGradient')).toBe(0);
    expect(count(visible, 'createLinearGradient')).toBe(0);
  });
});

describe('the shooting stars', () => {
  it('cross the full sky now and then, but never in its first twenty seconds', () => {
    const { visible, count } = mount('living');
    runTo(19_000);
    expect(count(visible, 'stroke')).toBe(0);

    // The schedule puts the first one at 47 s after the sky opened.
    runTo(46_500);
    expect(count(visible, 'stroke')).toBe(0);
    runTo(49_000);
    const first = count(visible, 'stroke');
    expect(first).toBeGreaterThan(0);

    // Then a long quiet while before the next.
    runTo(100_000);
    expect(count(visible, 'stroke')).toBe(first);
  });

  it('are timed from when the sky opened, not from page load', () => {
    const { rerender, visible, count, container } = mount('calm');
    runTo(300_000); // five minutes behind the timer: no shooting stars, and none owed
    expect(count(visible, 'stroke')).toBe(0);

    rerender(<AmbientCanvas themeKey={undefined} motion="living" />);
    const opened = now;
    runTo(opened + 19_000);
    expect(count(visible, 'stroke')).toBe(0);
    runTo(opened + 49_000);
    expect(count(visible, 'stroke')).toBeGreaterThan(0);
    expect(container.querySelector('canvas')).toBe(visible);
  });

  it('never cross the calm sky behind a timer, however long it runs', () => {
    const { visible, count } = mount('calm');
    runTo(400_000, 5_000);
    expect(count(visible, 'stroke')).toBe(0);
  });

  it('do not cross under reduced motion', () => {
    reduced = true;
    const { visible, count } = mount('living');
    runTo(120_000, 5_000);
    expect(count(visible, 'stroke')).toBe(0);
  });
});

describe('the depth shift', () => {
  it('listens to the pointer only in the living sky, and stops when it unmounts', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const calm = mount('calm');
    expect(add.mock.calls.some(([type]) => type === 'pointermove')).toBe(false);
    calm.unmount();

    const living = mount('living');
    expect(add.mock.calls.some(([type]) => type === 'pointermove')).toBe(true);
    living.unmount();
    expect(remove.mock.calls.some(([type]) => type === 'pointermove')).toBe(true);
  });

  it('does not listen at all under reduced motion', () => {
    reduced = true;
    const add = vi.spyOn(window, 'addEventListener');
    mount('living');
    expect(add.mock.calls.some(([type]) => type === 'pointermove')).toBe(false);
  });

  it('glides the nearest star a few pixels against the pointer, and back when it leaves', () => {
    const { visible } = mount('living');
    const field = ambientField();
    const star = field.stars[0]!; // a far-layer star
    const expectedX = (elapsedMs: number, shift: number) =>
      ((((star.x - (elapsedMs / 60_000) * LAYER_DRIFT[star.layer]) % 1) + 1) % 1) * 1000 - shift;
    const arcsPerFrame = field.stars.length + field.stars.filter((s) => s.layer === 2).length;
    const lastFirstStar = () => {
      const arcs = surfaces.get(visible)!['arc']!;
      // A frame draws every star (and a halo on the nearest layer): the frame starts here.
      return arcs[arcs.length - arcsPerFrame]![0] as number;
    };

    runTo(1_000);
    expect(lastFirstStar()).toBeCloseTo(expectedX(now, 0), 6);

    // The pointer goes to the right-hand edge: the scene shifts left, a layer-0 star by 1.5 px.
    act(() => {
      window.dispatchEvent(
        new MouseEvent('pointermove', {
          clientX: window.innerWidth,
          clientY: window.innerHeight / 2,
        }),
      );
    });
    runTo(now + 60_000);
    expect(lastFirstStar()).toBeCloseTo(expectedX(now, PARALLAX_PX[star.layer]), 6);

    act(() => {
      document.documentElement.dispatchEvent(new Event('pointerleave'));
    });
    runTo(now + 60_000);
    expect(lastFirstStar()).toBeCloseTo(expectedX(now, 0), 6);
  });

  it('never moves the calm sky: stars are drawn exactly where they drift to', () => {
    const { visible } = mount('calm');
    const field = ambientField();
    const star = field.stars[0]!;
    const arcsPerFrame = field.stars.length + field.stars.filter((s) => s.layer === 2).length;
    act(() => {
      window.dispatchEvent(
        new MouseEvent('pointermove', { clientX: window.innerWidth, clientY: 0 }),
      );
    });
    runTo(5_000);
    const arcs = surfaces.get(visible)!['arc']!;
    const x = arcs[arcs.length - arcsPerFrame]![0] as number;
    const expected = ((((star.x - (now / 60_000) * LAYER_DRIFT[star.layer]) % 1) + 1) % 1) * 1000;
    expect(x).toBeCloseTo(expected, 6);
  });

  it('copies the nebula unscaled, from a canvas a pixel larger each way, so a shift never shows an edge', () => {
    for (const motion of ['calm', 'living'] as const) {
      const { nebula, visible, count } = mount(motion);
      expect([nebula.width, nebula.height]).toEqual([1002, 702]);
      step(50);
      const blits = surfaces.get(visible)!['drawImage']!;
      expect(count(visible, 'drawImage')).toBe(1);
      // Three arguments: image and position, so the browser copies it and does not resample it.
      expect(blits[0]).toHaveLength(3);
      expect(blits[0]).toEqual([nebula, -1, -1]);
      cleanup();
      surfaces.clear();
    }
  });

  it('moves the nebula by at most one whole pixel with the pointer, and back', () => {
    const { visible, nebula } = mount('living');
    const lastBlit = () => surfaces.get(visible)!['drawImage']!.at(-1)!;
    const move = (clientX: number, clientY: number) =>
      act(() => {
        window.dispatchEvent(new MouseEvent('pointermove', { clientX, clientY }));
      });

    runTo(1_000);
    expect(lastBlit()).toEqual([nebula, -1, -1]);

    move(window.innerWidth, window.innerHeight); // bottom right: the scene shifts up and left
    runTo(now + 60_000);
    expect(lastBlit()).toEqual([nebula, -2, -2]);

    move(0, 0); // top left: it shifts down and right
    runTo(now + 60_000);
    expect(lastBlit()).toEqual([nebula, 0, 0]);

    act(() => {
      document.documentElement.dispatchEvent(new Event('pointerleave'));
    });
    runTo(now + 60_000);
    expect(lastBlit()).toEqual([nebula, -1, -1]);
  });
});
