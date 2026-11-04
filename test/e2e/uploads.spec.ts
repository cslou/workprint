import { test, expect, signIn } from './fixtures.js';

// Lou deferred this unfinished feature on 2026-11-04. Restore this journey with #125;
// keep persistence and credential-isolation assertions rather than deleting coverage.
test.fixme('an uploaded image is verified, previewed and still attached after reload, with no credentials sent to storage', {
  annotation: { type: 'issue', description: 'https://github.com/cslou/workprint/issues/125' },
}, async ({ page, context, backend }) => {
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
  // The row shows the image itself as a decorative key image; its name still comes from the text.
  const key = row.locator('img');
  await expect(key).toHaveAttribute('alt', '');
  await expect.poll(() => key.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(row).toHaveAccessibleName(/Image 1 · Version 1/);
  await row.click();
  await expect(page.getByRole('dialog').getByRole('img', { name: 'Saved image', exact: true })).toBeVisible();

  const observed = await Promise.all(transfers);
  expect(observed.filter(transfer => transfer.method === 'PUT')).toHaveLength(1);
  expect(observed.filter(transfer => transfer.method === 'GET').length).toBeGreaterThan(0);
  for (const transfer of observed) expect(transfer.headers.filter(name => ['authorization', 'cookie', 'referer'].includes(name))).toEqual([]);
});
