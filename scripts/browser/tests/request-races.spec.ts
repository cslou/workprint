import { expect, test } from '@playwright/test';
type Harness = { requestRace: { start(): void; terminal(): void; switchScope(): void; releaseList(): void; releaseDetail(): void; releaseTerminalDetail(): void; addRequest(): void; commands(): number; pending(): { lists: number; details: number } } };

test('older queued details cannot downgrade a running request', async ({ page }) => {
  await page.goto('/request-races.html'); await page.waitForFunction(() => !!(window as unknown as Harness).requestRace);
  await page.evaluate(() => (window as unknown as Harness).requestRace.start());
  const card = page.locator('[data-request-id="request-running"]'); await card.locator('summary').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as Harness).requestRace.pending().details)).toBe(1);
  await page.evaluate(() => (window as unknown as Harness).requestRace.releaseDetail());
  await expect(card.locator('.wp-status')).toHaveText('Running');
});

test('terminal detail observation survives disclosure collapse and reopening', async ({ page }) => {
  await page.goto('/request-races.html'); await page.waitForFunction(() => !!(window as unknown as Harness).requestRace);
  await page.evaluate(() => (window as unknown as Harness).requestRace.start());
  const card = page.locator('[data-request-id="request-running"]'); await card.locator('summary').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as Harness).requestRace.pending().details)).toBe(1);
  await page.evaluate(() => (window as unknown as Harness).requestRace.releaseTerminalDetail());
  await expect(card.locator('.wp-status')).toHaveText('Succeeded'); await card.locator('summary').click();
  await expect(card.locator('.wp-status')).toHaveText('Succeeded');
  await expect(card.getByRole('button', { name: 'Cancel request', exact: true })).toHaveCount(0);
  await card.locator('summary').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as Harness).requestRace.pending().details)).toBe(1);
  await page.evaluate(() => (window as unknown as Harness).requestRace.releaseDetail());
  await expect(card.locator('.wp-status')).toHaveText('Succeeded');
});

test('delayed list retains requests added by a newer workspace', async ({ page }) => {
  await page.goto('/request-races.html'); await page.waitForFunction(() => !!(window as unknown as Harness).requestRace);
  await page.evaluate(() => (window as unknown as Harness).requestRace.start());
  await page.evaluate(() => (window as unknown as Harness).requestRace.addRequest());
  await expect(page.locator('.wp-request-card')).toHaveCount(7);
  await page.evaluate(() => (window as unknown as Harness).requestRace.releaseList());
  await expect(page.locator('[data-request-id="new-workspace-request"]')).toBeVisible();
  await expect(page.locator('.wp-request-card')).toHaveCount(7);
});

test('terminal public snapshots beat delayed pending list and detail observations without invented revisions', async ({ page }, info) => {
  await info.attach('prerequisite', { body: 'Controlled read-only public request snapshots; no successful mutation/provider lifecycle simulation.', contentType: 'text/plain' });
  await page.goto('/request-races.html'); await page.waitForFunction(() => !!(window as unknown as Harness).requestRace);
  await page.evaluate(() => (window as unknown as Harness).requestRace.start());
  const card = page.locator('[data-request-id="request-running"]');
  await expect(card.locator('.wp-status')).toHaveText('Running');
  await card.locator('summary').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as Harness).requestRace.pending())).toEqual({ lists: 1, details: 1 });
  await page.evaluate(() => { (window as unknown as Harness).requestRace.terminal(); (window as unknown as Harness).requestRace.releaseList(); });
  await expect(card.locator('.wp-status')).toHaveText('Succeeded');
  await page.evaluate(() => (window as unknown as Harness).requestRace.releaseDetail());
  await expect(card.locator('.wp-status')).toHaveText('Succeeded');
  await expect(card.getByRole('button', { name: 'Cancel request', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as Harness).requestRace.commands())).toBe(0);
});

test('scope changes invalidate pending observations before old list completion', async ({ page }) => {
  await page.goto('/request-races.html'); await page.waitForFunction(() => !!(window as unknown as Harness).requestRace);
  await page.evaluate(() => (window as unknown as Harness).requestRace.start());
  await expect(page.locator('.wp-request-card')).toHaveCount(6);
  await page.evaluate(() => (window as unknown as Harness).requestRace.switchScope());
  await expect(page.locator('.wp-request-card')).toHaveCount(0);
  await page.evaluate(() => (window as unknown as Harness).requestRace.releaseList());
  await expect(page.locator('.wp-request-card')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as Harness).requestRace.commands())).toBe(0);
});
