import { expect, test, type Page } from '@playwright/test';

import { expectSignedIn, signIn } from '../support/app';
import { startClockInThePast } from '../support/clock';
import { createUser } from '../support/users';

/**
 * A finished session's completion moment (session-complete redesign, PR 1):
 * the star ignites and the result reveals itself, then settles; Escape or a
 * click skips it, and reduced motion shows the end at once.
 *
 * The stages are recorded from the page as they change (`data-stage` on the
 * result), so a check never depends on catching a stage with a poll.
 */

const recordStages = async (page: Page) => {
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __stages: string[] }).__stages = seen;
    const note = () => {
      const stage = document.querySelector('[data-stage]')?.getAttribute('data-stage');
      if (stage != null && seen.at(-1) !== stage) seen.push(stage);
    };
    new MutationObserver(note).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-stage'],
    });
  });
};

const stages = (page: Page) =>
  page.evaluate(() => (window as unknown as { __stages: string[] }).__stages);

/** Signs a new user in, runs a 25-minute session to its end, and waits for the result. */
const finishASession = async (page: Page, name: string) => {
  const user = await createUser(name);
  await startClockInThePast(page);
  await page.goto('/');
  await signIn(page, user);
  await expectSignedIn(page);
  await page.getByRole('button', { name: 'Start 25 min' }).click();
  await expect(page.getByRole('timer')).toContainText('25:00');
  await recordStages(page);
  await page.clock.fastForward('25:01');
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
};

const result = (page: Page) => page.locator('[data-stage]');

test('the moment plays through its stages and settles (PR 1, cases 1 and 7)', async ({ page }) => {
  await finishASession(page, 'moment-plays');
  await expect(result(page)).toHaveAttribute('data-stage', 'settled', { timeout: 3_500 });
  expect(await stages(page)).toEqual(['ignite', 'arrive', 'tally', 'settled']);
  // The sky's own star, in the session's stamped style (classic by default).
  await expect(page.getByTestId('result-star')).toHaveAttribute('data-style', 'classic');
});

test('Escape skips the moment and nothing else (PR 1, case 2)', async ({ page }) => {
  await finishASession(page, 'moment-escape');
  await page.keyboard.press('Escape');
  await expect(result(page)).toHaveAttribute('data-stage', 'settled');
  expect(await stages(page)).not.toContain('tally');
  // Still the result, on the timer view.
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View sky' })).toBeVisible();
});

test('a click mid-moment only skips it; the next one presses Done (PR 1, case 3)', async ({
  page,
}) => {
  await finishASession(page, 'moment-click');
  const done = page.getByRole('button', { name: 'Done' });
  await done.click();
  await expect(result(page)).toHaveAttribute('data-stage', 'settled');
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();

  await done.click();
  await expect(page.getByRole('button', { name: 'Start 25 min' })).toBeVisible();
});

test('reduced motion shows the settled result at once (PR 1, case 5)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await finishASession(page, 'moment-reduced');
  await expect(result(page)).toHaveAttribute('data-stage', 'settled');
  expect(await stages(page)).toEqual(['settled']);
});
