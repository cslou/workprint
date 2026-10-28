import { expect, test } from '@playwright/test';
type Harness = { selectionRace: { configure(mode: 'video' | 'panel'): void; pending(): number; complete(id: string, revision: number): void } };

test('one scoped Shot owns selection across every candidate row', async ({ page }, info) => {
  await info.attach('prerequisite', { body: 'Read-only public versions and controlled validated command acknowledgements; reconciliation proof, not persisted backend success.', contentType: 'text/plain' });
  await page.goto('/selection-races.html'); await page.waitForFunction(() => !!(window as unknown as Harness).selectionRace);
  await page.evaluate(() => (window as unknown as Harness).selectionRace.configure('video'));
  const rows = page.locator('.wp-video-row'); await expect(rows).toHaveCount(2);
  await expect(page.getByText('Chosen', { exact: true })).toHaveCount(1);
  await rows.nth(1).getByRole('button', { name: 'Use this version', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as Harness).selectionRace.pending())).toBe(1);
  await page.evaluate(() => (window as unknown as Harness).selectionRace.complete('video-v2', 11));
  await expect(rows.nth(1).getByText('Chosen', { exact: true })).toBeVisible();
  await expect(rows.nth(0).getByText('Chosen', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Chosen', { exact: true })).toHaveCount(1);
});

test('Panel choice is shared by every exact-version viewer', async ({ page }) => {
  await page.goto('/selection-races.html'); await page.waitForFunction(() => !!(window as unknown as Harness).selectionRace);
  await page.evaluate(() => (window as unknown as Harness).selectionRace.configure('panel'));
  await page.getByRole('button', { name: 'View Panel 1.1 version 2', exact: true }).click();
  await page.getByRole('button', { name: 'Use this version', exact: true }).click();
  await page.evaluate(() => (window as unknown as Harness).selectionRace.complete('panel-image-v2', 11));
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'View Panel 1.1 version 1', exact: true }).click();
  await expect(page.locator('[data-current-version-id]')).toHaveAttribute('data-current-version-id', 'panel-image-v2');
});
