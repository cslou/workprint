import type { Page } from '@playwright/test';
import { expect, test } from '../material-network.js';

type UploadsHarness = { uploadsTest: { configure(input: unknown): void } };
type ShellHarness = { shellTest: { configure(input: unknown): void } };
type Held = { path: string; respond(status: number, code: string): Promise<void> };
const hold = (page: Page, pattern: string, held: Held[]) => page.route(pattern, async (route) => {
  const path = new URL(route.request().url()).pathname;
  await new Promise<void>((resolve) => held.push({
    path,
    async respond(status, code) { resolve(); await route.fulfill({ status, json: { error: { code, message: 'Controlled scope race' } } }); },
  }));
});
const pending = async (held: Held[], count: number) => { await expect.poll(() => held.length).toBe(count); };

async function uploadScope(page: Page, accountId: string, conversationId: string) {
  await page.evaluate((input) => (window as unknown as UploadsHarness).uploadsTest.configure(input), { apiOrigin: 'http://127.0.0.1:4179', token: null, accountId, conversationId });
}

for (const order of ['new-first', 'old-first'] as const) test(`pending upload responses cannot cross an account change (${order})`, async ({ page, materialNetwork }) => {
  materialNetwork.expectOperations({ origin: 'http://127.0.0.1:4179', method: 'POST', path: '/v1/conversations/conversation-a/uploads', count: 2, query: {} });
  const held: Held[] = [];
  await page.goto('/uploads.html');
  await page.waitForFunction(() => !!(window as unknown as UploadsHarness).uploadsTest);
  await hold(page, '**/v1/conversations/*/uploads', held);
  const input = page.getByLabel('Choose an image or video', { exact: true });
  const image = { name: 'vale.png', mimeType: 'image/png', buffer: Buffer.from('image-bytes') };
  await uploadScope(page, 'account-a', 'conversation-a');
  await input.setInputFiles(image);
  await pending(held, 1);
  await uploadScope(page, 'account-b', 'conversation-a');
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('');
  await input.setInputFiles(image);
  await pending(held, 2);
  expect(held.map((entry) => entry.path)).toEqual([
    '/v1/conversations/conversation-a/uploads',
    '/v1/conversations/conversation-a/uploads',
  ]);
  if (order === 'new-first') {
    await held[1]!.respond(401, 'unauthenticated');
    await expect(page.locator('.wp-chat-feedback')).toHaveText('Sign-in required to upload a file. The file was not sent.');
    await held[0]!.respond(501, 'not_implemented');
  } else {
    await held[0]!.respond(501, 'not_implemented');
    await expect(page.locator('.wp-chat-feedback')).toHaveCount(0);
    await held[1]!.respond(401, 'unauthenticated');
  }
  await expect(page.locator('.wp-chat-feedback')).toHaveText('Sign-in required to upload a file. The file was not sent.');
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('');
});

for (const order of ['new-first', 'old-first'] as const) test(`pending upload responses cannot cross a conversation change (${order})`, async ({ page, materialNetwork }) => {
  materialNetwork.expectOperations(
    { origin: 'http://127.0.0.1:4179', method: 'POST', path: '/v1/conversations/conversation-a/uploads', count: 1, query: {} },
    { origin: 'http://127.0.0.1:4179', method: 'POST', path: '/v1/conversations/conversation-b/uploads', count: 1, query: {} },
  );
  const held: Held[] = [];
  await page.goto('/uploads.html');
  await page.waitForFunction(() => !!(window as unknown as UploadsHarness).uploadsTest);
  await hold(page, '**/v1/conversations/*/uploads', held);
  const input = page.getByLabel('Choose an image or video', { exact: true });
  const image = { name: 'vale.png', mimeType: 'image/png', buffer: Buffer.from('image-bytes') };
  await uploadScope(page, 'account-a', 'conversation-a');
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Scope A draft');
  await input.setInputFiles(image);
  await pending(held, 1);
  await uploadScope(page, 'account-a', 'conversation-b');
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('');
  await input.setInputFiles(image);
  await pending(held, 2);
  expect(held.map((entry) => entry.path)).toEqual([
    '/v1/conversations/conversation-a/uploads',
    '/v1/conversations/conversation-b/uploads',
  ]);
  if (order === 'new-first') {
    await held[1]!.respond(501, 'not_implemented');
    await expect(page.locator('.wp-chat-feedback')).toHaveText('Uploading files is not available yet. The file was not sent.');
    await held[0]!.respond(401, 'unauthenticated');
  } else {
    await held[0]!.respond(401, 'unauthenticated');
    await expect(page.locator('.wp-chat-feedback')).toHaveCount(0);
    await held[1]!.respond(501, 'not_implemented');
  }
  await expect(page.locator('.wp-chat-feedback')).toHaveText('Uploading files is not available yet. The file was not sent.');
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('');
});

const libraryPage = {
  items: [
    { id: 'vale', kind: 'reference', builtIn: true, latestVersion: { id: 'vale-v1', artifactId: 'artifact-vale', revision: 1, kind: 'reference', content: {}, createdBy: 'human', createdAt: '2026-10-29T00:00:00Z', dependencies: [] } },
    { id: 'bench', kind: 'reference', builtIn: false, latestVersion: { id: 'bench-v2', artifactId: 'artifact-bench', revision: 2, kind: 'reference', content: {}, createdBy: 'human', createdAt: '2026-10-29T00:00:00Z', dependencies: [] } },
  ],
  nextCursor: null,
};
const facts = { 'vale-v1': { name: 'Vale', tileLabel: 'Character', category: 'Characters' }, 'bench-v2': { name: 'Bench', tileLabel: 'Prop', category: 'Props' } };
async function shellScope(page: Page, conversationId: string, session: string) {
  await page.evaluate((input) => (window as unknown as ShellHarness).shellTest.configure(input), { session: { accountId: session, name: 'Creator A' }, apiOrigin: 'http://127.0.0.1:4179', token: 'token', conversationId, libraryPrerequisites: { display: facts } });
}
async function openLibrary(page: Page) {
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(page.locator('.wp-picker')).toBeVisible();
}

for (const order of ['new-first', 'old-first'] as const) test(`pending attach responses cannot cross a conversation change (${order})`, async ({ page, materialNetwork }) => {
  const origin = 'http://127.0.0.1:4179';
  materialNetwork.expectOperations(
    { origin, method: 'GET', path: '/v1/conversations/conversation-a/workspace', count: 1, query: {} },
    { origin, method: 'GET', path: '/v1/conversations/conversation-b/workspace', count: 1, query: {} },
    { origin, method: 'GET', path: '/v1/library', count: 2, query: {} },
    { origin, method: 'POST', path: '/v1/conversations/conversation-a/uses', count: 1, query: {} },
    { origin, method: 'POST', path: '/v1/conversations/conversation-b/uses', count: 1, query: {} },
  );
  const held: Held[] = [];
  await page.goto('/shell.html');
  await page.waitForFunction(() => !!(window as unknown as ShellHarness).shellTest);
  await page.route('**/v1/library*', async (route) => { await route.fulfill({ status: 200, json: libraryPage }); });
  await hold(page, '**/v1/conversations/*/uses', held);
  await shellScope(page, 'conversation-a', 'account-a');
  await openLibrary(page);
  await page.locator('.wp-picker-tile').filter({ hasText: 'Vale' }).click();
  await page.getByRole('button', { name: 'Attach (1)', exact: true }).click();
  await pending(held, 1);
  await shellScope(page, 'conversation-b', 'account-a');
  await openLibrary(page);
  await expect(page.locator('.wp-picker-count')).toHaveText('Nothing selected yet');
  await page.locator('.wp-picker-tile').filter({ hasText: 'Bench' }).click();
  await page.getByRole('button', { name: 'Attach (1)', exact: true }).click();
  await pending(held, 2);
  expect(held.map((entry) => entry.path)).toEqual([
    '/v1/conversations/conversation-a/uses',
    '/v1/conversations/conversation-b/uses',
  ]);
  if (order === 'new-first') {
    await held[1]!.respond(401, 'unauthenticated');
    await expect(page.locator('.wp-picker-feedback')).toHaveText('Sign-in required to attach from your Library. Nothing was attached.');
    await held[0]!.respond(501, 'not_implemented');
  } else {
    await held[0]!.respond(501, 'not_implemented');
    await expect(page.locator('.wp-picker-feedback')).toHaveCount(0);
    await held[1]!.respond(401, 'unauthenticated');
  }
  await expect(page.locator('.wp-picker-feedback')).toHaveText('Sign-in required to attach from your Library. Nothing was attached.');
  await expect(page.locator('.wp-picker-chip')).toHaveText(['Bench×']);
  await expect(page.locator('.wp-picker-tile[aria-pressed="true"]')).toHaveText([/Bench/]);
});
