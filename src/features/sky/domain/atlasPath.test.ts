import { describe, expect, it } from 'vitest';

import { parsePath, pathPoints, pathToPixels, samplePath } from './atlasPath';

describe('parsePath', () => {
  it('reads absolute M, L, C, Q and Z', () => {
    const segments = parsePath('M0.1 0.2L0.3 0.4C0.1 0.1 0.2 0.2 0.3 0.3Q0.5 0.5 0.6 0.6Z');
    expect(segments.map((s) => s.command)).toEqual(['M', 'L', 'C', 'Q', 'Z']);
    expect(segments[2]!.numbers).toEqual([0.1, 0.1, 0.2, 0.2, 0.3, 0.3]);
  });

  it('accepts negative numbers, commas and repeated pairs after one command', () => {
    expect(parsePath('M-0.02,0.1L0.2 0.3 0.4 0.5').map((s) => s.numbers)).toEqual([
      [-0.02, 0.1],
      [0.2, 0.3, 0.4, 0.5],
    ]);
  });

  it('refuses anything outside the language', () => {
    expect(() => parsePath('m0.1 0.2')).toThrow(/Unsupported/); // relative
    expect(() => parsePath('M0 0A1 1 0 0 1 2 2')).toThrow(/Unsupported/); // arc
    expect(() => parsePath('M0.1')).toThrow(/takes 2/);
    expect(() => parsePath('M0 0C0.1 0.1 0.2 0.2')).toThrow(/takes 6/);
    expect(() => parsePath('0.1 0.2')).toThrow(/start with a command/);
  });
});

describe('pathToPixels', () => {
  it('scales unit coordinates into a box, x by width and y by height', () => {
    expect(pathToPixels('M0 0L1 1', { x: 10, y: 20, size: 100 })).toBe('M10 20L110 120');
    expect(pathToPixels('M0.5 0.25Q1 0 0 1Z', { x: 0, y: 0, size: 200 })).toBe(
      'M100 50Q200 0 0 200Z',
    );
  });

  it('keeps every command, including a close', () => {
    const d = 'M0.1 0.1C0.2 0.2 0.3 0.3 0.4 0.4Z';
    expect(parsePath(pathToPixels(d, { x: 0, y: 0, size: 50 })).map((s) => s.command)).toEqual([
      'M',
      'C',
      'Z',
    ]);
  });
});

describe('pathPoints and samplePath', () => {
  it('lists every pair, control points included', () => {
    expect(pathPoints('M0 0C0.1 0.2 0.3 0.4 0.5 0.6')).toEqual([
      [0, 0],
      [0.1, 0.2],
      [0.3, 0.4],
      [0.5, 0.6],
    ]);
  });

  it('samples along a curve and stops at its end', () => {
    const points = samplePath('M0 0C0 0.5 0.5 1 1 1', 10);
    expect(points[0]).toEqual([0, 0]);
    expect(points.at(-1)![0]).toBeCloseTo(1, 9);
    expect(points.at(-1)![1]).toBeCloseTo(1, 9);
    expect(points).toHaveLength(11);
  });

  it('walks along a straight line, not just its ends', () => {
    const points = samplePath('M0 0L1 0', 4);
    expect(points).toEqual([
      [0, 0],
      [0.25, 0],
      [0.5, 0],
      [0.75, 0],
      [1, 0],
    ]);
  });

  it('returns to the start on Z', () => {
    const points = samplePath('M0.2 0.2L0.8 0.2L0.5 0.8Z');
    expect(points.at(-1)).toEqual([0.2, 0.2]);
  });
});
