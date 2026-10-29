import { browserOrigin } from '../origin.js';
import type { Page } from '@playwright/test';
import { expect, test } from '../material-network.js';

type Harness = { uploadsTest: { configure(input: unknown): void; confirm(id: string): Promise<string>; unmount(): void } };
async function configure(page: Page, conversationId: string) {
  await page.evaluate(conversationId => (window as unknown as Harness).uploadsTest.configure({ apiOrigin: window.location.origin, token: null, accountId: 'read-only-account', conversationId }), conversationId);
}
for (const order of ['new-first', 'old-first', 'unmount'] as const) test(`pending confirmation cannot overwrite or resurrect its mount (${order})`, async ({ page, materialNetwork }, info) => {
  const origin = browserOrigin;
  materialNetwork.expectOperations({ origin, method: 'POST', path: '/v1/uploads/read-only-upload-a/confirm', count: 1, query: {} });
  if (order !== 'unmount') materialNetwork.expectOperations({ origin, method: 'POST', path: '/v1/uploads/read-only-upload-b/confirm', count: 1, query: {} });
  await info.attach('prerequisite', { body: 'Held confirmation failure responses for supplied read-only upload identities. No upload transfer, success or persisted version is simulated.', contentType: 'text/plain' });
  const held: ((status: number, code: string) => Promise<void>)[] = [];
  await page.route('**/v1/uploads/*/confirm', async route => {
    await new Promise<void>(resolve => held.push(async (status, code) => { await route.fulfill({ status, json: { error: { code, message: 'Controlled confirmation scope race' } } }); resolve(); }));
  });
  await page.goto('/uploads.html'); await page.waitForFunction(() => !!(window as unknown as Harness).uploadsTest);
  await configure(page, 'conversation-a');
  const old = page.evaluate(() => (window as unknown as Harness).uploadsTest.confirm('read-only-upload-a'));
  await expect.poll(() => held.length).toBe(1);
  if (order === 'unmount') {
    await page.evaluate(() => (window as unknown as Harness).uploadsTest.unmount());
    await held[0]!(501, 'not_implemented'); await old;
    await expect(page.locator('[data-confirm]')).toHaveCount(0); return;
  }
  await configure(page, 'conversation-b');
  const current = page.evaluate(() => (window as unknown as Harness).uploadsTest.confirm('read-only-upload-b'));
  await expect.poll(() => held.length).toBe(2);
  if (order === 'new-first') {
    await held[1]!(401, 'unauthenticated'); await current;
    await expect(page.locator('[data-confirm]')).toHaveText('Sign-in required to confirm this upload. No version was created.');
    await held[0]!(501, 'not_implemented'); await old;
  } else {
    await held[0]!(501, 'not_implemented'); await old;
    await expect(page.locator('[data-confirm]')).toHaveText('');
    await held[1]!(401, 'unauthenticated'); await current;
  }
  await expect(page.locator('[data-confirm]')).toHaveText('Sign-in required to confirm this upload. No version was created.');
});
