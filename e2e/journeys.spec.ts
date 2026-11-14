import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function addMedicine(page: Page) {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Add your first medicine', exact: true })
    .click();
  await page
    .getByLabel('Medicine name', { exact: true })
    .fill('Example tablets');
  await page.getByLabel('Generic or Chinese name (optional)').fill('示例药品');
  await page.getByLabel('Ingredient 1', { exact: true }).fill('Paracetamol');
  await page.getByLabel('Strength 1', { exact: true }).fill('500');
  await page.getByLabel('Quantity (tablet)', { exact: true }).fill('20');
  await page
    .getByLabel('Expiry date (optional)', { exact: true })
    .fill('2099-01-01');
  await page
    .getByRole('button', { name: 'Add to cabinet', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Add to cabinet', exact: true }),
  ).toBeHidden();
}

async function openMedicine(page: Page) {
  await page.getByRole('link', { name: 'Cabinet', exact: true }).click();
  await page
    .getByRole('button', { name: 'Open Example tablets', exact: true })
    .click();
  await expect(page).toHaveURL(/\/medicine\/[\da-f-]+$/);
  await expect(
    page.getByRole('heading', { name: 'Example tablets', exact: true }),
  ).toBeVisible();
}

test('inventory, plan, actual dose, recovery, consultation export, and deletion', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await addMedicine(page);
  await openMedicine(page);
  await expect(
    page.getByText('20 tablet', { exact: true }).last(),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Edit medicine', exact: true })
    .click();
  await page
    .getByLabel('Generic or Chinese name (optional)')
    .fill('Updated synthetic name');
  await page
    .getByRole('button', { name: 'Save medicine', exact: true })
    .click();
  await expect(
    page.getByText('Updated synthetic name', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Add batch', exact: true }).click();
  await page.getByLabel('Quantity (tablet)', { exact: true }).fill('5');
  await page
    .getByLabel('Expiry date (optional)', { exact: true })
    .fill('2099-02-01');
  await page
    .getByRole('button', { name: 'Add batch', exact: true })
    .last()
    .click();
  await expect(
    page.getByRole('button', { name: 'Adjust batch 2' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Edit batch 2', exact: true }).click();
  await page
    .getByLabel('Storage location', { exact: true })
    .fill('Travel case');
  await page.getByRole('button', { name: 'Save batch', exact: true }).click();
  await expect(page.getByText('Travel case', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'History', exact: true }).click();
  await page
    .getByRole('button', { name: 'Start episode', exact: true })
    .click();
  await page
    .getByLabel('Episode name', { exact: true })
    .fill('Synthetic seasonal symptoms');
  await page.getByLabel('Symptom', { exact: true }).fill('Runny nose');
  await page
    .getByRole('button', { name: 'Start episode', exact: true })
    .last()
    .click();
  await expect(
    page.getByText('Synthetic seasonal symptoms', { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Plans', exact: true }).click();
  await page.getByRole('button', { name: 'Add plan', exact: true }).click();
  await page.getByLabel('Planned amount (tablet)', { exact: true }).fill('1');
  await page
    .getByLabel('Instructions', { exact: true })
    .fill('Synthetic test instruction; not medical advice.');
  await page
    .getByRole('button', { name: 'Related episode: No episode', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Synthetic seasonal symptoms', exact: true })
    .click();
  await page.getByRole('button', { name: 'Save plan', exact: true }).click();
  await page.getByRole('button', { name: 'Record dose', exact: true }).click();
  await page
    .getByRole('button', { name: 'Confirm dose taken', exact: true })
    .click();
  await openMedicine(page);
  await expect(page.getByText('19 tablet', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('19 tablet', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'History', exact: true }).click();
  await page
    .getByRole('button', { name: 'Mark recovered', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Mark recovered', exact: true })
    .last()
    .click();
  await expect(page.getByText('RECOVERED', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Consultation summary', exact: true })
    .click();
  const file = await downloaded;
  const content = await readFile((await file.path())!, 'utf8');
  expect(content).toContain('Example tablets');
  expect(content).toContain('Synthetic seasonal symptoms');
  expect(content).toContain('taken');
  await page
    .getByRole('button', { name: 'Delete all my records', exact: true })
    .click();
  await page
    .getByLabel('Type DELETE to confirm', { exact: true })
    .fill('DELETE');
  await page
    .getByRole('button', { name: 'Permanently delete', exact: true })
    .click();
  await expect(
    page.getByText('Your local records have been deleted.', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('link', { name: 'Cabinet', exact: true }).click();
  await expect(
    page.getByText('A home for your medicines', { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('invalid amount has a useful error and cannot change stock', async ({
  page,
}) => {
  await addMedicine(page);
  await openMedicine(page);
  await page
    .getByRole('button', { name: 'Record a dose', exact: true })
    .click();
  await page.getByLabel('Amount (tablet)', { exact: true }).fill('999');
  await page
    .getByRole('button', { name: 'Confirm dose taken', exact: true })
    .click();
  await expect(page.getByText(/insufficient stock/)).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(
    page.getByText('20 tablet', { exact: true }).last(),
  ).toBeVisible();
});

test('offline restart retains records and can record a new dose', async ({
  page,
  context,
}) => {
  await addMedicine(page);
  await openMedicine(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByText('20 tablet', { exact: true }).last(),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Record a dose', exact: true })
    .click();
  await page.getByLabel('Amount (tablet)', { exact: true }).fill('1');
  await page
    .getByRole('button', { name: 'Confirm dose taken', exact: true })
    .click();
  await expect(
    page.getByText('19 tablet', { exact: true }).last(),
  ).toBeVisible();
});

test('sample data, advisor abstention, themes, and responsive routes', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Explore sample data', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Exit demo', exact: true }),
  ).toBeVisible();
  const todayLink = page.getByRole('link', { name: 'Today', exact: true });
  expect((await todayLink.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({
    path: testInfo.outputPath('today-light.png'),
    fullPage: true,
  });
  await page.getByRole('link', { name: 'Cabinet', exact: true }).click();
  await page.getByLabel('Search medicines').fill('西替利嗪');
  await expect(
    page.getByRole('button', { name: 'Open Cetirizine' }),
  ).toBeVisible();
  await page.getByLabel('Search medicines').fill('');
  await page.getByRole('button', { name: 'Expired', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Open Ibuprofen' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Advisor', exact: true }).click();
  await page
    .getByLabel('Question for your pharmacist (optional)')
    .fill('Which medicine can I take for a cough?');
  await page
    .getByRole('button', { name: 'Review my records', exact: true })
    .click();
  await expect(
    page
      .getByText(/MedKit cannot determine which medicine is suitable/)
      .first(),
  ).toBeVisible();
  const consultationDownload = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Export consultation summary', exact: true })
    .click();
  const consultation = await consultationDownload;
  expect(await readFile((await consultation.path())!, 'utf8')).toContain(
    'Which medicine can I take for a cough?',
  );
  await page
    .getByRole('checkbox', {
      name: 'I have severe symptoms that may need urgent care',
    })
    .click();
  await expect(page.getByText(/call 995/)).toBeVisible();
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Theme: Use device setting' }).click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await page.getByRole('link', { name: 'Today', exact: true }).click();
  await page.screenshot({
    path: testInfo.outputPath('today-dark.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Exit demo', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Add your first medicine', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
