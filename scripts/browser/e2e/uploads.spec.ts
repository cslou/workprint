import { test, expect, signIn } from './fixtures.js';

test('an uploaded image is verified, previewed and still attached after reload, with no credentials sent to storage', async ({ page, context, backend }) => {
  const [account] = await backend.accounts(1);
  const conversation = await backend.app.saveNative(account!.id);
  const storage = new URL(backend.media.configuration.endpoint).origin;
  const transfers: Promise<{ method: string; headers: string[] }>[] = [];
  context.on('request', request => {
    if (new URL(request.url()).origin === storage) transfers.push(request.allHeaders().then(headers => ({ method: request.method(), headers: Object.keys(headers) })));
  });
  // Cookies are scoped by host, not port: a cookie for the storage host would ride along unless requests omit credentials.
  await context.addCookies([{ name: 'storage-cookie-control', value: 'synthetic', url: storage }]);
  await signIn(page, account!, `/app?conversation=${conversation.id}`);

  await page.getByLabel('Choose a JPEG or PNG image').setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: backend.media.imageBytes });
  await expect(page.getByRole('heading', { name: 'Image saved · Version 1' })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole('img', { name: 'Saved image' })).toHaveAttribute('src', /^blob:/);
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  await page.reload();
  await page.getByRole('tab', { name: 'Assets', exact: true }).click();
  const row = page.locator('.wp-asset-row');
  await expect(row).toHaveCount(1);
  await row.click();
  await expect(page.getByRole('dialog').getByRole('img', { name: 'Saved image', exact: true })).toBeVisible();

  const observed = await Promise.all(transfers);
  expect(observed.filter(transfer => transfer.method === 'PUT')).toHaveLength(1);
  expect(observed.filter(transfer => transfer.method === 'GET').length).toBeGreaterThan(0);
  for (const transfer of observed) expect(transfer.headers.filter(name => ['authorization', 'cookie', 'referer'].includes(name))).toEqual([]);
});
