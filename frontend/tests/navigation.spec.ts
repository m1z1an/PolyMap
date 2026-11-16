import { expect, test } from '@playwright/test';

const entrance = '7ce68475-2696-4e91-9065-b59f9ed4f7de';
const room = '6a6adde3-f5bc-42bd-9f9c-ca0b45c311ca';
const roomLink = `/share/annotation?annotation=${room}`;
const routeLink = `/share/route?from=${entrance}&to=${room}`;

test('find a real room and switch floors', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Корпуса с планами')).toBeVisible();
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await page.getByRole('textbox', { name: 'Поиск аудитории, корпуса или места' }).fill('206');
  await page.getByRole('button', { name: /Кабинет 206/ }).first().click();
  await expect(page.getByTestId('place-title')).toHaveText('Кабинет 206');
  await page.getByRole('button', { name: 'Этаж 1', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Этаж 1', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('shared room and multilevel route load directly', async ({ page }) => {
  await page.goto(roomLink);
  await expect(page.getByTestId('place-title')).toHaveText('Кабинет 206');
  await page.getByRole('button', { name: 'Маршрут сюда' }).click();
  await expect(page.getByTestId('route-summary')).toContainText(/\d+ м · \d+ мин/);
  await page.goto(routeLink);
  await expect(page.getByTestId('route-summary')).toBeVisible();
  await expect(page.getByRole('button', { name: /· этаж 2/ })).not.toHaveCount(0);
});

test('the previously loaded map opens offline', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name === 'webkit-iphone', 'Offline emulation is checked in Chromium.');
  await page.goto('/');
  await expect(page.getByText('Корпуса с планами')).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.goto(roomLink);
  await expect(page.getByTestId('place-title')).toHaveText('Кабинет 206');
});
