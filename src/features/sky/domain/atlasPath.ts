/**
 * The little path language the atlas art is written in: absolute `M`, `L`, `C`,
 * `Q` and `Z` only, with coordinates in the unit square. Keeping to that lets a
 * test read every drawing, check it lies where it should, and lets the sky scale
 * it to pixels by multiplying numbers (no transform, so strokes stay one width
 * at any size and a path's own length is what an animation measures).
 */

export type PathCommand = 'M' | 'L' | 'C' | 'Q' | 'Z';

export interface PathSegment {
  command: PathCommand;
  /** The numbers after the command, as x, y pairs. */
  numbers: number[];
}

/** How many numbers each command takes. */
const ARITY: Record<PathCommand, number> = { M: 2, L: 2, C: 6, Q: 4, Z: 0 };

const TOKEN = /([MLCQZ])|(-?\d*\.?\d+)/g;

/**
 * Reads a path into segments. Throws on anything outside the language (a
 * relative command, an arc, a missing number), so a malformed drawing fails a
 * test instead of drawing something odd.
 */
export const parsePath = (d: string): PathSegment[] => {
  const stripped = d.replace(TOKEN, '').replace(/[\s,]/g, '');
  if (stripped.length > 0) throw new Error(`Unsupported path text: "${stripped}"`);

  const segments: PathSegment[] = [];
  for (const [, command, number] of d.matchAll(TOKEN)) {
    if (command !== undefined) segments.push({ command: command as PathCommand, numbers: [] });
    else if (segments.length === 0) throw new Error('A path must start with a command');
    else segments[segments.length - 1]!.numbers.push(Number(number));
  }
  for (const s of segments) {
    if (
      s.numbers.length !== ARITY[s.command] &&
      !(s.command !== 'Z' && s.numbers.length > 0 && s.numbers.length % ARITY[s.command] === 0)
    ) {
      throw new Error(`${s.command} takes ${ARITY[s.command]} numbers, got ${s.numbers.length}`);
    }
  }
  return segments;
};

export const toPathString = (segments: readonly PathSegment[]): string =>
  segments.map((s) => `${s.command}${s.numbers.join(' ')}`).join('');

const round = (n: number): number => Math.round(n * 100) / 100;

/** The same path with its unit-square coordinates placed in a box on screen. */
export const pathToPixels = (d: string, box: { x: number; y: number; size: number }): string =>
  toPathString(
    parsePath(d).map((s) => ({
      command: s.command,
      numbers: s.numbers.map((n, i) =>
        round(i % 2 === 0 ? box.x + n * box.size : box.y + n * box.size),
      ),
    })),
  );

/** Every x, y pair a path visits, control points included. */
export const pathPoints = (d: string): [number, number][] => {
  const out: [number, number][] = [];
  for (const s of parsePath(d)) {
    for (let i = 0; i + 1 < s.numbers.length; i += 2) out.push([s.numbers[i]!, s.numbers[i + 1]!]);
  }
  return out;
};

/**
 * Points along a path: a few along each line and curve, so a test can
 * ask how near a drawing passes to a star or how much of a box it covers.
 */
export const samplePath = (d: string, perCurve = 12): [number, number][] => {
  const out: [number, number][] = [];
  let at: [number, number] | null = null;
  let start: [number, number] | null = null;
  for (const s of parsePath(d)) {
    const n = s.numbers;
    if (s.command === 'M') {
      at = [n[0]!, n[1]!];
      start = at;
      out.push(at);
    } else if (s.command === 'Z') {
      if (start !== null) out.push(start);
      at = start;
    } else if (at !== null) {
      const arity = s.command === 'L' ? 2 : s.command === 'Q' ? 4 : 6;
      for (let i = 0; i + arity <= n.length; i += arity) {
        const p0 = at;
        const pts = n.slice(i, i + arity);
        const end: [number, number] = [pts[arity - 2]!, pts[arity - 1]!];
        if (s.command === 'L') {
          for (let k = 1; k <= perCurve; k++) {
            const t = k / perCurve;
            out.push([p0[0] + (end[0] - p0[0]) * t, p0[1] + (end[1] - p0[1]) * t]);
          }
        } else {
          for (let k = 1; k <= perCurve; k++) {
            const t = k / perCurve;
            const u = 1 - t;
            out.push(
              s.command === 'Q'
                ? [
                    u * u * p0[0] + 2 * u * t * pts[0]! + t * t * pts[2]!,
                    u * u * p0[1] + 2 * u * t * pts[1]! + t * t * pts[3]!,
                  ]
                : [
                    u ** 3 * p0[0] +
                      3 * u * u * t * pts[0]! +
                      3 * u * t * t * pts[2]! +
                      t ** 3 * pts[4]!,
                    u ** 3 * p0[1] +
                      3 * u * u * t * pts[1]! +
                      3 * u * t * t * pts[3]! +
                      t ** 3 * pts[5]!,
                  ],
            );
          }
        }
        at = end;
      }
    }
  }
  return out;
};
