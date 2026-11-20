import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Durations come from the motion tokens (`duration-enter`, `duration-page-in`,
 * … in index.css), never a number, and only transform and opacity animate, so
 * no arbitrary `transition-[…]` (UI review L3). Reading the source is crude on
 * purpose: it is the cheapest thing that stops the rule drifting back.
 */
const sources = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });

const RAW_DURATION = /\bduration-\d+\b/;
const ARBITRARY_TRANSITION = /\btransition-\[/;

describe('motion in components', () => {
  const files = sources(join(process.cwd(), 'src'));

  it('reads the source tree', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('uses no raw duration utility (duration-300, duration-500, …)', () => {
    const hits = files.filter((f) => RAW_DURATION.test(readFileSync(f, 'utf8')));
    expect(hits.map((f) => f.slice(process.cwd().length + 1))).toEqual([]);
  });

  it('uses no arbitrary transition property (transition-[width], …)', () => {
    const hits = files.filter((f) => ARBITRARY_TRANSITION.test(readFileSync(f, 'utf8')));
    expect(hits.map((f) => f.slice(process.cwd().length + 1))).toEqual([]);
  });
});
