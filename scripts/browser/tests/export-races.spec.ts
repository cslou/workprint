import type { Page } from '@playwright/test';
import { expect, test } from '../material-network.js';
type Harness = { exportsTest: { configure(input: unknown): void; remount(): void; unmount(): void } };
const origin = 'http://127.0.0.1:4179';
async function setup(page: Page) { await page.goto('/exports.html'); await page.waitForFunction(() => !!(window as unknown as Harness).exportsTest); }
async function configure(page: Page, input: unknown) { await page.evaluate(input => (window as unknown as Harness).exportsTest.configure(input), input); }
type Held = { respond(value: unknown): Promise<void> };
for (const mode of ['history', 'detail'] as const) for (const change of ['account', 'conversation'] as const) for (const order of ['old-first', 'new-first'] as const) test(`${mode} discards pending ${change} results (${order})`, async ({ page, materialNetwork }, info) => {
  await info.attach('prerequisite', { body: 'Controlled schema-valid read-only responses, genuinely pending across scope change. Test-only client collaborator omits read cancellation so both HTTP responses reach application settlement. No writes or persisted lifecycle.', contentType: 'text/plain' });
  const firstPath = mode === 'history' ? '/v1/conversations/conversation-a/exports' : '/v1/exports/export-exact';
  const secondPath = mode === 'history' && change === 'conversation' ? '/v1/conversations/conversation-b/exports' : firstPath;
  materialNetwork.expectOperations({ origin, method: 'GET', path: firstPath, count: firstPath === secondPath ? 2 : 1, query: {} }, ...(firstPath !== secondPath ? [{ origin, method: 'GET', path: secondPath, count: 1, query: {} }] : []));
  const held: Held[] = [];
  await page.route('**/v1/**', route => new Promise<void>(resolve => held.push({ async respond(value) { await route.fulfill({ json: value }); resolve(); } })));
  await setup(page);
  await configure(page, { apiOrigin: origin, mode, uncancellableReads: true, accountId: 'account-a', conversationId: 'conversation-a' });
  await expect.poll(() => held.length).toBe(1);
  await configure(page, { apiOrigin: origin, mode, uncancellableReads: true, accountId: change === 'account' ? 'account-b' : 'account-a', conversationId: change === 'conversation' ? 'conversation-b' : 'conversation-a' });
  await expect.poll(() => held.length).toBe(2);
  const record = (status: string, current: boolean) => ({ id: 'export-exact', status, capturedSelectionRevision: 8, current, sources: [], compatibility: { compatible: true, issues: [] } });
  const value = (status: string, current: boolean) => mode === 'history' ? { items: [record(status, current)], nextCursor: null } : record(status, current);
  const status = page.locator(mode === 'history' ? '.wp-export-card .wp-status' : '.wp-export-facts .wp-status');
  if (order === 'old-first') {
    await held[0]!.respond(value('failed', true));
    await expect(status).toHaveCount(0);
    await held[1]!.respond(value('succeeded', false));
  } else {
    await held[1]!.respond(value('succeeded', false));
    await expect(status).toHaveText('Succeeded');
    await held[0]!.respond(value('failed', true));
  }
  await expect(status).toHaveText('Succeeded');
  await expect(page.getByText('Uses earlier chosen versions.', { exact: true })).toBeVisible();
  await expect(page.getByText('Uses your current chosen versions.', { exact: true })).toHaveCount(0);
  materialNetwork.assertSafe();
});

test('pending Export is latched and remount/reconnect never replay it', async ({ page, materialNetwork }, info) => {
  await info.attach('prerequisite', { body: 'Controlled pending Export failure only, not a successful command. Consumable observer allows exactly one explicit submission and zero lifecycle replay.', contentType: 'text/plain' });
  materialNetwork.expectOperations({ origin, method: 'POST', path: '/v1/conversations/conversation-a/exports', count: 1, query: {} });
  let finish: (() => Promise<void>) | undefined;
  await page.route('**/v1/**', route => new Promise<void>(resolve => { finish = async () => { await route.fulfill({ status: 501, json: { error: { code: 'not_implemented', message: 'Controlled pending boundary' } } }); resolve(); }; }));
  await setup(page); await configure(page, { apiOrigin: origin, mode: 'entry' });
  await page.getByRole('button', { name: 'Export', exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect.poll(() => !!finish).toBe(true);
  await expect(page.getByText('Requesting export…', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeDisabled();
  await page.evaluate(() => (window as unknown as Harness).exportsTest.remount());
  await page.evaluate(() => { dispatchEvent(new Event('offline')); dispatchEvent(new Event('online')); });
  await finish!();
  await expect(page.getByText('No export was queued and no file was created.', { exact: true })).toHaveCount(0);
  await page.evaluate(() => (window as unknown as Harness).exportsTest.remount());
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeEnabled();
  materialNetwork.assertSafe();
});

test('Export sends the revision of the newly displayed Videos choice, not the older workspace', async ({ page, materialNetwork }, info) => {
  await info.attach('prerequisite', { body: 'Read-only exact video/workspace and controlled useVersion acknowledgement to reach an otherwise unavailable selection branch. Export itself fails, never produces a record.', contentType: 'text/plain' });
  materialNetwork.expectOperations(
    { origin, method: 'GET', path: '/v1/versions/video-exact', count: 2, query: {} },
    { origin, method: 'GET', path: '/v1/conversations/conversation-a/generation-requests', count: 1, query: {} },
    { origin, method: 'POST', path: '/v1/conversations/conversation-a/uses', count: 1, query: {}, purpose: 'shot_video' },
    { origin, method: 'POST', path: '/v1/conversations/conversation-a/exports', count: 1, query: {} },
  );
  await page.route('**/v1/**', async route => {
    if (new URL(route.request().url()).pathname.endsWith('/uses')) await route.fulfill({ json: { use: { id: 'use-observed', versionId: 'video-exact', binding: { purpose: 'shot_video', shotId: 'shot-exact' }, state: 'approved' }, selectionRevision: 31 } });
    else await route.abort('failed');
  });
  await setup(page); await configure(page, { apiOrigin: origin });
  await page.locator('.wp-video-row').getByRole('button', { name: 'Use this version', exact: true }).click();
  await expect(page.locator('.wp-video-row .wp-status')).toHaveText('Chosen');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.getByText('No export was queued and no file was created.', { exact: true })).toBeVisible();
  expect(materialNetwork.entries.filter(entry => entry.method === 'POST' && entry.url.pathname.endsWith('/exports')).map(entry => entry.body)).toEqual([{ operationId: expect.stringMatching(/^[0-9a-f-]{36}$/), selectionRevision: 31 }]);
  await page.keyboard.press('Escape');
  await expect(page.locator('.wp-video-row .wp-status')).toHaveText('Chosen');
});
