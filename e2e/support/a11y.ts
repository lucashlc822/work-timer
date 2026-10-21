import { writeFileSync } from 'node:fs';

import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo } from '@playwright/test';

/**
 * Accessibility scans with axe-core: WCAG 2.0 and 2.1, levels A and AA, plus
 * axe's own best-practice rules.
 *
 * Every violation is attached to the Playwright report as JSON, per screen.
 * When `ENFORCE` is on, the test fails on "serious" and "critical" ones (axe's
 * own impact scale); "moderate" and "minor" are attached and listed but never
 * fail. No rule is switched off in here: a rule that is wrong for a screen is
 * a decision for the person who owns the design, written into `ACKNOWLEDGED`
 * below with the reason, not a quiet exclusion.
 */

/**
 * Whether serious and critical findings fail the test. They do. (It started
 * report-only so the first findings could be looked at before anything could
 * fail; they were fixed, and this was turned on in the same change.) Setting it
 * false again turns the scan back into a report, and should only ever be a
 * temporary step.
 */
export const ENFORCE = true;

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];

/** The impact levels that fail a test. */
const BLOCKING = new Set(['serious', 'critical']);

/**
 * Findings someone has looked at and chosen to live with, keyed
 * `"<screen> | <rule id>"`, each with the reason. Empty until a person adds one.
 */
export const ACKNOWLEDGED: Readonly<Record<string, string>> = {};

export interface Finding {
  screen: string;
  rule: string;
  impact: string;
  help: string;
  helpUrl: string;
  nodes: string[];
}

/** The CSS transitions between views last 500 ms; scan after they settle. */
export const settleTransitions = (page: Page): Promise<void> => page.waitForTimeout(700);

export const scan = async (page: Page, screen: string): Promise<Finding[]> => {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return results.violations.map((violation) => ({
    screen,
    rule: violation.id,
    impact: violation.impact ?? 'minor',
    help: violation.help,
    helpUrl: violation.helpUrl,
    nodes: violation.nodes.map((node) => {
      const why = [...node.any, ...node.all, ...node.none][0]?.message ?? '';
      return `${node.target.join(' ')}  →  ${node.html.slice(0, 140)}  [${why}]`;
    }),
  }));
};

/** Attaches everything found, then fails on blocking findings nobody has acknowledged. */
export const report = async (testInfo: TestInfo, findings: Finding[]): Promise<void> => {
  // Also a plain file next to the test's other output, so it can be read
  // without opening the HTML report.
  const file = testInfo.outputPath('accessibility-findings.json');
  writeFileSync(file, JSON.stringify(findings, null, 2));
  await testInfo.attach('accessibility-findings.json', {
    path: file,
    contentType: 'application/json',
  });

  const blocking = findings.filter(
    (f) => BLOCKING.has(f.impact) && ACKNOWLEDGED[`${f.screen} | ${f.rule}`] === undefined,
  );
  const lines = blocking.map(
    (f) =>
      `[${f.impact}] ${f.screen}: ${f.rule} (${f.nodes.length}) — ${f.help}\n    ${f.nodes[0] ?? ''}`,
  );

  if (!ENFORCE) {
    const summary = `${blocking.length} serious or critical, ${findings.length - blocking.length} other (report only)`;
    testInfo.annotations.push({ type: 'accessibility', description: summary });
    console.log(`\nAccessibility, ${testInfo.title}: ${summary}\n${lines.join('\n')}\n`);
    return;
  }
  expect(lines, `Blocking accessibility findings:\n${lines.join('\n')}`).toEqual([]);
};
