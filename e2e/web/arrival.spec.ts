import { expect, test } from '@playwright/test';

import { dismissResult, goHome, goToTimer, signIn } from '../support/app';
import { startClockInThePast } from '../support/clock';
import { createUser } from '../support/users';

/**
 * A finished session's star arriving in the sky behind the result
 * (session-complete redesign, PR 5). The hero sky is decorative and hidden from
 * assistive tech, so it is found by its data attributes.
 */
test.use({ viewport: { width: 480, height: 720 } });

test('the new star lights up in its constellation and the line that joins it draws in (PR 5, case 1)', async ({
  page,
}) => {
  const user = await createUser('arrival');
  await startClockInThePast(page);
  await page.goto('/');
  await signIn(page, user);
  await goToTimer(page);
  await goHome(page);
  await page.getByRole('button', { name: 'Choose a constellation' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^The Kite/ })
    .click();

  for (let i = 0; i < 2; i++) {
    await goToTimer(page);
    await page.getByRole('button', { name: 'Start 25 min' }).click();
    await expect(page.getByRole('timer')).toContainText('25:00');
    await page.clock.fastForward('25:01');
    await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
    if (i === 0) await dismissResult(page);
  }

  // Nothing arrives until the moment gets there (~900 ms in)...
  const lit = page.locator('[data-arrival="star"]');
  await expect(lit).toHaveCount(1);
  await expect(lit).toHaveClass('sky-arrive');
  // ...then it lights in its place, and only its own line draws in.
  await expect(page.locator('line.sky-draw')).toHaveCount(1);
  // At this size the Kite's second star is clear of the result's star: light flies there first.
  await expect(page.locator('[data-arrival="mote"]')).toHaveCount(1);
  await expect(page.locator('[data-celebration]')).toHaveCount(0);

  // Done takes it all away: the hero is still again.
  await dismissResult(page);
  await expect(page.locator('[data-arrival], line.sky-draw')).toHaveCount(0);
});
