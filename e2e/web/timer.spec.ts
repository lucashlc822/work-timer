import { expect, test } from '@playwright/test';

import { expectSignedIn, openView, signIn, stardustPill, syncLine } from '../support/app';
import { startClockInThePast } from '../support/clock';
import { adminClient, createUser } from '../support/users';

/**
 * The timer, end to end: a session the clock carries to its end becomes a
 * completed session, a star and Stardust; one ended early keeps its focus time
 * and earns nothing. Both reach the server.
 *
 * The page's clock starts in the past (support/clock.ts) so a fast-forwarded
 * session ends before the server's own "now" and uploads like a real one.
 */

const serverSessions = async (userId: string) => {
  const { data, error } = await adminClient()
    .from('sessions')
    .select('outcome, actual_focus_s, planned_duration_s, mode')
    .eq('user_id', userId);
  expect(error).toBeNull();
  return data ?? [];
};

const serverLedgerSum = async (userId: string): Promise<number> => {
  const { data, error } = await adminClient().from('ledger').select('delta').eq('user_id', userId);
  expect(error).toBeNull();
  return (data ?? []).reduce((sum, row: { delta: number }) => sum + row.delta, 0);
};

test('a 25-minute session the clock carries to the end becomes a star and 25 Stardust', async ({
  page,
}) => {
  const user = await createUser('timer-done');
  await startClockInThePast(page);
  await page.goto('/');
  await signIn(page, user);
  await expectSignedIn(page);
  await expect(stardustPill(page)).toHaveText(/\b0 Stardust$/);

  await page.getByRole('button', { name: 'Start 25 min' }).click();
  await expect(page.getByRole('timer')).toContainText('25:00');

  await page.clock.fastForward('25:01');

  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
  await expect(page.getByText('25 minutes of focus')).toBeVisible();
  await expect(page.getByText('+25 Stardust')).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();

  await expect(stardustPill(page)).toHaveText(/\b25 Stardust$/);

  // It reached the server: one completed 25-minute session, and the ledger.
  await expect
    .poll(async () => await serverSessions(user.id), { timeout: 20_000 })
    .toEqual([
      { outcome: 'completed', actual_focus_s: 1500, planned_duration_s: 1500, mode: 'countdown' },
    ]);
  await expect.poll(() => serverLedgerSum(user.id), { timeout: 20_000 }).toBe(25);

  // And the app agrees nothing was refused.
  await openView(page, 'Account');
  await expect(syncLine(page)).toContainText('Backed up');
  await expect(page.getByText("couldn't be backed up")).toHaveCount(0);
});

test('ending early keeps the focused time, earns nothing, and the dialog can be backed out of', async ({
  page,
}) => {
  const user = await createUser('timer-early');
  await startClockInThePast(page);
  await page.goto('/');
  await signIn(page, user);
  await expectSignedIn(page);

  await page.getByRole('button', { name: 'Start 25 min' }).click();
  await expect(page.getByRole('timer')).toBeVisible();
  await page.clock.fastForward('10:00');

  // "Keep going" leaves the session running.
  await page.getByRole('button', { name: 'End early' }).click();
  await expect(page.getByRole('alertdialog', { name: 'End this session early?' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep going' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.getByRole('timer')).toBeVisible();

  // "End session" saves it as ended early.
  await page.getByRole('button', { name: 'End early' }).click();
  await page.getByRole('button', { name: 'End session' }).click();

  await expect(page.getByRole('heading', { name: 'Session ended early' })).toBeVisible();
  await expect(page.getByText('10 minutes of focus')).toBeVisible();
  await expect(page.getByText(/\+\d+ Stardust/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(stardustPill(page)).toHaveText(/\b0 Stardust$/);

  await expect
    .poll(async () => await serverSessions(user.id), { timeout: 20_000 })
    .toEqual([
      { outcome: 'cancelled', actual_focus_s: 600, planned_duration_s: 1500, mode: 'countdown' },
    ]);
  expect(await serverLedgerSum(user.id)).toBe(0);
});

test('a running session survives a reload and still finishes on schedule', async ({ page }) => {
  const user = await createUser('timer-reload');
  await startClockInThePast(page);
  await page.goto('/');
  await signIn(page, user);
  await expectSignedIn(page);

  await page.getByRole('button', { name: 'Start 25 min' }).click();
  await expect(page.getByRole('timer')).toBeVisible();
  await page.clock.fastForward('20:00');

  await page.reload();
  await expect(page.getByRole('timer')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('timer')).toContainText(/0?[45]:\d\d/);

  await page.clock.fastForward('05:01');
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(stardustPill(page)).toHaveText(/\b25 Stardust$/);
});
