import { expect, test } from '@playwright/test';

const key = process.env.POLYMAP_TEST_ADMIN_KEY;
test('submit a report and close it in the moderation desk', async ({ page }, info) => {
  test.skip(!key || info.project.name !== 'chromium-desktop', 'Requires local FastAPI and the test admin key.');
  await page.goto('/share/annotation?annotation=6a6adde3-f5bc-42bd-9f9c-ca0b45c311ca');
  await page.getByRole('button', { name: 'Сообщить об ошибке' }).click();
  const message = `Тестовая проверка подписи на плане ${Date.now()}`;
  await page.getByRole('textbox', { name: 'Описание ошибки на карте' }).fill(message);
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect(page.getByText('Сообщение отправлено.')).toBeVisible();

  await page.getByRole('link', { name: 'Стол заявок' }).click();
  await page.getByLabel('Ключ доступа').fill(key!);
  await page.getByRole('button', { name: 'Загрузить заявки' }).click();
  await expect(page.getByText(message)).toBeVisible();
  const result = page.getByLabel('Результат проверки').first();
  await result.fill('Подпись на плане проверена.');
  await page.getByRole('button', { name: 'Закрыть заявку' }).first().click();
  await expect(page.getByText(/№\d+ · Закрыта/).first()).toBeVisible();
});
