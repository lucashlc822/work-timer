#!/usr/bin/env node
// Report-only: how big is the built app, against a committed baseline?
//
//   npm run build && npm run perf:size
//   npm run perf:size -- --update     (after a deliberate change: rewrites the baseline)
//
// Sizes are gzipped bytes of dist/assets, which is what a first visit
// downloads. Growth of more than 10% over the baseline, in total JS, total
// CSS or the largest JS file, is printed as a warning. This never fails: it
// exits 0 whatever it finds, and in CI it writes the table to the job summary.
// A person (or the qa-lead agent) reads it and decides.

import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const ASSETS = 'dist/assets';
const BASELINE = 'e2e/perf-baseline.json';
const THRESHOLD = 0.1;

if (!existsSync(ASSETS)) {
  console.log('No dist/assets: run `npm run build` first.');
  process.exit(0);
}

const files = readdirSync(ASSETS)
  .filter((name) => /\.(js|css)$/.test(name))
  .map((name) => ({
    name,
    gzip: gzipSync(readFileSync(join(ASSETS, name))).length,
    raw: readFileSync(join(ASSETS, name)).length,
  }));

const js = files.filter((f) => f.name.endsWith('.js'));
const css = files.filter((f) => f.name.endsWith('.css'));
const sum = (list) => list.reduce((total, f) => total + f.gzip, 0);
const largest = js.reduce((best, f) => (f.gzip > best.gzip ? f : best), { gzip: 0, name: '' });

const now = {
  totalJsGzip: sum(js),
  totalCssGzip: sum(css),
  largestJsGzip: largest.gzip,
};

if (process.argv.includes('--update')) {
  writeFileSync(BASELINE, JSON.stringify(now, null, 2) + '\n');
  console.log(`Baseline written to ${BASELINE}:`, now);
  process.exit(0);
}

const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;
const rows = [
  ['Total JavaScript (gzip)', 'totalJsGzip'],
  ['Total CSS (gzip)', 'totalCssGzip'],
  [`Largest JavaScript file (gzip), ${largest.name}`, 'largestJsGzip'],
];

const lines = ['| Measure | Baseline | Now | Change |', '|---|---|---|---|'];
let grew = 0;
for (const [label, key] of rows) {
  const before = baseline?.[key];
  const change = before === undefined ? null : (now[key] - before) / before;
  const flag = change !== null && change > THRESHOLD ? ' ⚠' : '';
  if (flag) grew += 1;
  lines.push(
    `| ${label} | ${before === undefined ? 'none' : kb(before)} | ${kb(now[key])} | ${
      change === null ? '–' : `${change >= 0 ? '+' : ''}${(change * 100).toFixed(1)}%`
    }${flag} |`,
  );
}
lines.push(
  '',
  grew > 0
    ? `${grew} measure(s) grew more than ${THRESHOLD * 100}% over the baseline. Report only: nothing fails.`
    : baseline === null
      ? `No baseline yet: run \`npm run perf:size -- --update\` to create ${BASELINE}.`
      : `Within ${THRESHOLD * 100}% of the baseline.`,
);

const text = lines.join('\n');
console.log(text);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Bundle size (report only)\n\n${text}\n`);
}
