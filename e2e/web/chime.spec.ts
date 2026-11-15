import { expect, test, type Page } from '@playwright/test';

import { backToTimer, expectSignedIn, openAccount, signIn, skipMoment } from '../support/app';
import { startClockInThePast } from '../support/clock';
import { createUser } from '../support/users';

/**
 * The completion chime (session-complete redesign, PR 4). Web Audio is
 * replaced by a counting stand-in, so a test sees whether the app asked for a
 * chime without a sound card, and a headless browser's autoplay rules don't
 * decide the result.
 */

const countChimes = async (page: Page) =>
  page.evaluate(() => (window as unknown as { __chimes: number }).__chimes);

const signedInWithFakeAudio = async (page: Page, name: string) => {
  await page.addInitScript(() => {
    (window as unknown as { __chimes: number }).__chimes = 0;
    class FakeAudioContext {
      currentTime = 0;
      destination = {};
      constructor() {
        (window as unknown as { __chimes: number }).__chimes += 1;
      }
      createGain() {
        const param = {
          value: 1,
          setValueAtTime: () => {},
          linearRampToValueAtTime: () => {},
          exponentialRampToValueAtTime: () => {},
        };
        return { gain: param, connect: () => {} };
      }
      createOscillator() {
        return {
          type: '',
          frequency: { value: 0 },
          connect: () => {},
          start: () => {},
          stop: () => {},
        };
      }
      resume() {
        return Promise.resolve();
      }
      close() {
        return Promise.resolve();
      }
    }
    (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
  });
  const user = await createUser(name);
  await startClockInThePast(page);
  await page.goto('/');
  await signIn(page, user);
  await expectSignedIn(page);
};

const runToTheEnd = async (page: Page) => {
  await page.getByRole('button', { name: 'Start 25 min' }).click();
  await expect(page.getByRole('timer')).toContainText('25:00');
  await page.clock.fastForward('25:01');
};

test('a session ending in a visible window chimes once, by default (PR 4, case 1)', async ({
  page,
}) => {
  await signedInWithFakeAudio(page, 'chime-on');
  await runToTheEnd(page);
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
  await expect.poll(() => countChimes(page)).toBe(1);
  // Skipping the moment, or waiting it out, doesn't ring it again.
  await skipMoment(page);
  expect(await countChimes(page)).toBe(1);
});

test('the switch turns it off, and stays off after a reload (PR 4, cases 2 and 5)', async ({
  page,
}) => {
  await signedInWithFakeAudio(page, 'chime-off');
  await openAccount(page);
  const sound = page.getByRole('checkbox', { name: 'Completion sound' });
  await expect(sound).toBeChecked();
  await sound.click();
  await expect(sound).not.toBeChecked();
  await backToTimer(page);

  await page.reload();
  await expectSignedIn(page);
  await openAccount(page);
  await expect(page.getByRole('checkbox', { name: 'Completion sound' })).not.toBeChecked();
  await backToTimer(page);

  await runToTheEnd(page);
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
  await expect(page.locator('[data-stage]')).toHaveAttribute('data-stage', 'settled', {
    timeout: 5_000,
  });
  expect(await countChimes(page)).toBe(0);
});

test('a session that ended while the window was hidden plays its moment on return, silently (PR 4, case 3)', async ({
  page,
}) => {
  await signedInWithFakeAudio(page, 'chime-hidden');
  await page.getByRole('button', { name: 'Start 25 min' }).click();
  await expect(page.getByRole('timer')).toContainText('25:00');

  const setVisibility = (state: 'hidden' | 'visible') =>
    page.evaluate((s) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s });
      document.dispatchEvent(new Event('visibilitychange'));
    }, state);
  await setVisibility('hidden');
  await page.clock.fastForward('25:01');
  // 15 s pass with nobody looking, past the window in which a chime still fits.
  await page.clock.fastForward('00:15');
  await setVisibility('visible');

  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
  await expect(page.locator('[data-stage]')).not.toHaveAttribute('data-stage', 'waiting');
  expect(await countChimes(page)).toBe(0);
});
