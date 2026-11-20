import { expect, test, type Page } from '@playwright/test';

import { goToTimer, signIn } from '../support/app';
import { report, scan, settleTransitions } from '../support/a11y';
import { startClockInThePast } from '../support/clock';
import { createUser } from '../support/users';

/**
 * The idle timer card in Pomodoro mode. Its four sliders sit two to a row, so
 * switching Countdown → Pomodoro grows the card by 52–88 px, not 202, and the
 * constellation's slot (which keeps GROWTH_RESERVE free under the card) never
 * has to give the room back: the card doesn't move and the page doesn't scroll.
 */

const signedIn = async (page: Page, label: string) => {
  const user = await createUser(label);
  await startClockInThePast(page);
  await page.goto('/');
  await signIn(page, user);
  await goToTimer(page);
  await page.waitForTimeout(900);
};

const radio = (page: Page, name: string) => page.getByRole('radio', { name, exact: true });

const card = (page: Page) =>
  page.locator('[data-timer-card]').evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom };
  });

const scrollHeight = (page: Page) => page.evaluate(() => document.documentElement.scrollHeight);

const settle = (page: Page) => page.waitForTimeout(700);

for (const size of [
  { width: 1920, height: 1080 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
]) {
  test(`A1: at ${size.width}x${size.height} switching Countdown, Pomodoro, Custom never moves the card`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await signedIn(page, `pl-a1-${size.width}`);
    const start = (await card(page)).top;
    // Custom is a length in Countdown mode, so it comes before switching to Pomodoro.
    for (const mode of ['Custom', 'Pomodoro', 'Countdown']) {
      await radio(page, mode).click();
      await settle(page);
      expect(Math.abs((await card(page)).top - start), mode).toBeLessThan(1);
      expect(await scrollHeight(page), `${mode} scroll`).toBeLessThanOrEqual(size.height);
    }
  });
}

test('A2: at 480x720 Custom, Pomodoro and Countdown all fit without scrolling', async ({
  page,
}) => {
  await page.setViewportSize({ width: 480, height: 720 });
  await signedIn(page, 'pl-a2');
  for (const mode of ['Custom', 'Pomodoro', 'Countdown']) {
    await radio(page, mode).click();
    await settle(page);
    expect(await scrollHeight(page), mode).toBeLessThanOrEqual(720);
  }
});

test('A3: at 380x560 Pomodoro scrolls far less than it did, and no more than a line past Custom', async ({
  page,
}) => {
  await page.setViewportSize({ width: 380, height: 560 });
  await signedIn(page, 'pl-a3');
  await radio(page, 'Custom').click();
  await settle(page);
  const custom = await scrollHeight(page);
  await radio(page, 'Pomodoro').click();
  await settle(page);
  // Before the grid Pomodoro scrolled to 694 here, 101 px past Custom. Now it is
  // 7 px past it on Windows (600 v 593); a line of slack for another platform's
  // text, which wraps the summary line differently (CI: 615).
  expect(await scrollHeight(page)).toBeLessThanOrEqual(custom + 24);
});

// 365 is the 380 px desktop minimum less a 15 px classic scrollbar (headless hides it).
for (const width of [365, 380, 480]) {
  test(`A4: at ${width} px wide each Pomodoro label and value is on one line, and the summary is centred`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width <= 380 ? 560 : 720 });
    await signedIn(page, `pl-a4-${width}`);
    await radio(page, 'Pomodoro').click();
    await settle(page);
    const panel = page.locator('[data-timer-card] label').first().locator('xpath=..');
    const rows = await panel.locator('label > span:first-child').evaluateAll((els) =>
      els.map((el) => {
        const lh = parseFloat(getComputedStyle(el).lineHeight);
        return Math.round(el.getBoundingClientRect().height / lh);
      }),
    );
    expect(rows).toEqual([1, 1, 1, 1]);
    // A narrow settings area uses the smaller size (a container query), so a
    // platform whose text is wider (CI's Linux) still fits a label and its value.
    const size = await panel
      .locator('label > span:first-child')
      .first()
      .evaluate((el) => getComputedStyle(el).fontSize);
    expect(size).toBe(width <= 380 ? '12px' : '14px');
    const summary = await panel.locator('p').evaluate((el) => {
      const r = el.getBoundingClientRect();
      const p = el.parentElement!.getBoundingClientRect();
      return {
        centre: (r.left + r.right) / 2 - (p.left + p.right) / 2,
        align: getComputedStyle(el).textAlign,
      };
    });
    expect(summary.align).toBe('center');
    expect(Math.abs(summary.centre)).toBeLessThan(1);
  });
}

// The card's own lines arrive from the local database ~100 ms after the page
// opens. A slot frozen before them left too little room for the next growth,
// and the card jumped up 88 px when a mode was chosen. No waiting for them here.
test('A8: choosing a mode straight after the page opens never moves the card', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const user = await createUser('pl-a8');
  await startClockInThePast(page);
  await page.goto('/');
  await signIn(page, user);
  await goToTimer(page);
  await page.waitForTimeout(900);
  const start = (await card(page)).top;
  for (const mode of ['Custom', 'Pomodoro', 'Countdown']) {
    await radio(page, mode).click();
    await settle(page);
    expect(Math.abs((await card(page)).top - start), mode).toBeLessThan(1);
    expect(await scrollHeight(page), `${mode} scroll`).toBeLessThanOrEqual(900);
  }
});

test('A5b: each slider still moves its value, by dragging and by arrow keys', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signedIn(page, 'pl-a5');
  await radio(page, 'Pomodoro').click();
  const focus = page.getByRole('slider', { name: 'Focus in minutes' });
  const before = Number(await focus.inputValue());
  await focus.focus();
  await page.keyboard.press('ArrowRight');
  expect(Number(await focus.inputValue())).toBeGreaterThan(before);
  const every = page.getByRole('slider', { name: 'Long break every' });
  const box = (await every.boundingBox())!;
  const was = Number(await every.inputValue());
  await page.mouse.click(box.x + box.width - 2, box.y + box.height / 2);
  expect(Number(await every.inputValue())).toBeGreaterThanOrEqual(was);
});

test('A7: axe finds nothing serious on the idle timer in Pomodoro mode', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 480, height: 720 });
  await signedIn(page, 'pl-a7');
  await radio(page, 'Pomodoro').click();
  await settleTransitions(page);
  await report(testInfo, await scan(page, 'timer, idle, Pomodoro (2x2)'));
});
