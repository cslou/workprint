import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import type { verifyBuiltAdmission as VerifyBuiltAdmission } from '../../../apps/api/test/auth-built-fixture.js';
import type { Version } from '../../../packages/contracts/src/index.js';

type UploadsHarness = { uploadsTest: { configure(input: unknown): void; confirm(uploadId: string): Promise<string>; unmount(): void } };
type ShellHarness = { shellTest: { configure(input: unknown): void } };
const libraryItems = (() => {
  const version = (id: string, revision: number, kind: 'reference' | 'image' | 'video'): Version => kind === 'reference'
    ? { id, artifactId: `artifact-${id}`, revision, kind, content: {}, createdBy: 'human', createdAt: '2026-10-29T00:00:00Z', dependencies: [] }
    : { id, artifactId: `artifact-${id}`, revision, kind, media: { contentType: kind === 'image' ? 'image/png' : 'video/mp4', byteSize: 1024, width: 640, height: 640 }, createdBy: 'human', createdAt: '2026-10-29T00:00:00Z', dependencies: [] };
  return [
    { id: 'vale', kind: 'reference' as const, builtIn: true, latestVersion: version('vale-v1', 1, 'reference') },
    { id: 'mercer', kind: 'reference' as const, builtIn: true, latestVersion: version('mercer-v1', 1, 'reference') },
    { id: 'gallery', kind: 'image' as const, builtIn: true, latestVersion: version('gallery-v3', 3, 'image') },
    { id: 'bench', kind: 'reference' as const, builtIn: false, latestVersion: version('bench-v2', 2, 'reference') },
  ];
})();
const display = {
  'vale-v1': { name: 'Vale', category: 'Characters', image: { src: '/fixtures/library-tile.png', alt: 'Vale' } },
  'mercer-v1': { name: 'Mercer', category: 'Characters', image: { src: '/fixtures/library-tile.png', alt: 'Mercer' } },
  'gallery-v3': { name: 'The gallery', category: 'Places', image: { src: '/fixtures/library-tile.png', alt: 'The gallery' } },
  'bench-v2': { name: 'Bench', category: 'Props', image: { src: '/fixtures/library-tile.png', alt: 'Bench' } },
} as const;
const labels = ['Vale', 'Mercer', 'The gallery', 'Bench'];
const requests: { method: string; path: string; body: unknown }[] = [];
async function openPicker(page: Page, origin: string, token: string | null, options: { conversationId?: string; prerequisites?: unknown } = {}) {
  await page.goto('/shell.html');
  await page.waitForFunction(() => !!(window as unknown as ShellHarness).shellTest);
  await page.route('**/v1/library*', async (route) => {
    requests.push({ method: route.request().method(), path: new URL(route.request().url()).pathname + new URL(route.request().url()).search, body: null });
    await route.fulfill({ status: 200, json: { items: libraryItems, nextCursor: null } });
  });
  await page.evaluate((input) => (window as unknown as ShellHarness).shellTest.configure(input), { session: { accountId: 'account-a', name: 'Creator A' }, apiOrigin: origin, token, ...(options.conversationId === undefined ? {} : { conversationId: options.conversationId }), libraryPrerequisites: { display: options.prerequisites ?? display } });
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

test('pasted prose stays ordinary text and Send keeps it with zero network', async ({ page, context }) => {
  await page.goto('/chat.html');
  await page.waitForFunction(() => !!(window as unknown as { chatTest?: unknown }).chatTest);
  await page.evaluate(() => (window as unknown as { chatTest: { configure(value: boolean): void } }).chatTest.configure(false));
  const requests: string[] = [];
  await page.route('**/v1/**', (route) => { requests.push(route.request().url()); throw new Error('Paste and send must not issue HTTP'); });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const prose = 'Mercer and Vale sit side by side on the gallery bench.';
  await page.evaluate((text) => navigator.clipboard.writeText(text), prose);
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await input.focus();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
  await expect(input).toHaveValue(prose);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.locator('.wp-chat-feedback')).toHaveText('Sending messages is not available yet. Your message is kept.');
  await expect(input).toHaveValue(prose);
  expect(await page.evaluate(() => (window as unknown as { chatTest: { calls(): string[] } }).chatTest.calls())).toEqual(['sendText']);
  expect(requests).toEqual([]);
});

test('the actual file input initiates the exact metadata and never transfers or confirms', async ({ page }, info) => {
  test.setTimeout(120000);
  await info.attach('prerequisite', { body: 'Synthetic local image and video files; the initiation request is continued to the built loopback backend, never fulfilled with a success.', contentType: 'text/plain' });
  const { verifyBuiltAdmission } = await import(pathToFileURL(resolve('apps/api/.test-build/test/auth-built-fixture.js')).href) as { verifyBuiltAdmission: typeof VerifyBuiltAdmission };
  const cleanup: (() => void | Promise<void>)[] = [];
  try {
    await verifyBuiltAdmission({ diagnostic(message) { console.log(message); }, after(fn) { cleanup.push(fn); } }, async ({ origin, accessTokens: [token] }) => {
      await page.goto('/uploads.html');
      await page.waitForFunction(() => !!(window as unknown as UploadsHarness).uploadsTest);
      await page.evaluate((input) => (window as unknown as UploadsHarness).uploadsTest.configure(input), { apiOrigin: origin, token, accountId: 'account-a', conversationId: 'conversation-a' });
      const input = page.getByLabel('Choose an image or video', { exact: true });
      const text = page.getByRole('textbox', { name: 'Message', exact: true });
      await text.fill('A quiet moment in the gallery.');
      const seen: { method: string; path: string; body: Record<string, unknown> }[] = [];
      await page.route('**/v1/**', async (route) => {
        const url = new URL(route.request().url());
        expect(url.origin).toBe(origin);
        seen.push({ method: route.request().method(), path: url.pathname, body: JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown> });
        await route.continue();
      });
      const image = await readFile('apps/web/test/fixtures/library-tile.png');
      const response = page.waitForResponse((value) => new URL(value.url()).pathname === '/v1/conversations/conversation-a/uploads');
      await input.setInputFiles({ name: 'vale portrait.png', mimeType: 'image/png', buffer: image });
      expect((await response).status()).toBe(501);
      await expect(page.locator('.wp-chat-feedback')).toHaveText('Uploading files is not available yet. The file was not sent.');
      expect(seen).toHaveLength(1);
      expect(seen[0]).toMatchObject({ method: 'POST', path: '/v1/conversations/conversation-a/uploads' });
      expect(seen[0]!.body).toMatchObject({ kind: 'image', filename: 'vale portrait.png', contentType: 'image/png', byteSize: image.byteLength, intendedUse: { purpose: 'reference' } });
      expect(typeof seen[0]!.body.operationId).toBe('string');
      expect(seen.filter((entry) => entry.path !== '/v1/conversations/conversation-a/uploads' || entry.method !== 'POST')).toEqual([]);
      expect(await input.evaluate((element) => (element as HTMLInputElement).files?.length ?? 0)).toBe(0);
      await expect(text).toHaveValue('A quiet moment in the gallery.');
      const video = await readFile('apps/web/test/fixtures/clip.webm');
      const videoResponse = page.waitForResponse((value) => new URL(value.url()).pathname === '/v1/conversations/conversation-a/uploads');
      await input.setInputFiles({ name: 'clip.webm', mimeType: 'video/webm', buffer: video });
      expect((await videoResponse).status()).toBe(501);
      expect(seen[1]!.body).toMatchObject({ kind: 'video', filename: 'clip.webm', contentType: 'video/webm', byteSize: video.byteLength });
      expect(seen.every((entry) => entry.path === '/v1/conversations/conversation-a/uploads' && entry.method === 'POST')).toBe(true);
      expect(seen.some((entry) => /\/confirm$/.test(entry.path))).toBe(false);
      await page.evaluate((input) => (window as unknown as UploadsHarness).uploadsTest.configure(input), { apiOrigin: origin, token: null, accountId: 'account-a', conversationId: 'conversation-a' });
      await text.fill('A quiet moment in the gallery.');
      const unauthorized = page.waitForResponse((value) => new URL(value.url()).pathname === '/v1/conversations/conversation-a/uploads');
      await input.setInputFiles({ name: 'vale portrait.png', mimeType: 'image/png', buffer: image });
      expect((await unauthorized).status()).toBe(401);
      await expect(page.locator('.wp-chat-feedback')).toHaveText('Sign-in required to upload a file. The file was not sent.');
      expect(seen[2]!.body).toMatchObject({ kind: 'image', filename: 'vale portrait.png', contentType: 'image/png', byteSize: image.byteLength });
      await expect(text).toHaveValue('A quiet moment in the gallery.');
      await page.unroute('**/v1/**');
    }, { browserOrigin: 'http://127.0.0.1:4179' });
  } finally { for (const finish of cleanup.reverse()) await finish(); }
});

test('upload 401, transport failure, unsupported type and no conversation send nothing they must not', async ({ page }) => {
  await page.goto('/uploads.html');
  await page.waitForFunction(() => !!(window as unknown as UploadsHarness).uploadsTest);
  const input = page.getByLabel('Choose an image or video', { exact: true });
  const text = page.getByRole('textbox', { name: 'Message', exact: true });
  const seen: { method: string; path: string }[] = [];
  const image = await readFile('apps/web/test/fixtures/library-tile.png');
  await page.route('**/v1/**', async (route) => { seen.push({ method: route.request().method(), path: new URL(route.request().url()).pathname }); await route.abort('failed'); });
  await page.evaluate(() => (window as unknown as UploadsHarness).uploadsTest.configure({ apiOrigin: 'http://127.0.0.1:4179', token: 'token', accountId: 'account-a', conversationId: 'conversation-a' }));
  await text.fill('Retained while the upload fails.');
  await input.setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: image });
  await expect(page.locator('.wp-chat-feedback')).toHaveText('The file was not uploaded. Nothing was changed.');
  await page.unroute('**/v1/**');
  const before = seen.length;
  await page.evaluate(() => (window as unknown as UploadsHarness).uploadsTest.configure({ apiOrigin: 'http://127.0.0.1:4179', token: 'token', accountId: 'account-a', conversationId: 'conversation-a' }));
  await input.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not media') });
  await expect(page.locator('.wp-chat-feedback')).toHaveText('That file is not an image or video. The file was not sent.');
  await page.evaluate(() => (window as unknown as UploadsHarness).uploadsTest.configure({ apiOrigin: 'http://127.0.0.1:4179', token: 'token', accountId: 'account-a' }));
  await input.setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: image });
  await expect(page.locator('.wp-chat-feedback')).toHaveText('Uploading files is not available yet. The file was not sent.');
  expect(seen.slice(before)).toEqual([]);
  expect(seen.some((entry) => /confirm$/.test(entry.path))).toBe(false);
});

test('the isolated confirmation consumer calls the real route and exposes no version on 501', async ({ page }, info) => {
  test.setTimeout(120000);
  await info.attach('prerequisite', { body: 'Read-only synthetic upload identity supplied by the isolated mount. No transfer, initiation success or product control is fabricated.', contentType: 'text/plain' });
  const { verifyBuiltAdmission } = await import(pathToFileURL(resolve('apps/api/.test-build/test/auth-built-fixture.js')).href) as { verifyBuiltAdmission: typeof VerifyBuiltAdmission };
  const cleanup: (() => void | Promise<void>)[] = [];
  try {
    await verifyBuiltAdmission({ diagnostic(message) { console.log(message); }, after(fn) { cleanup.push(fn); } }, async ({ origin, accessTokens: [token] }) => {
      await page.goto('/uploads.html');
      await page.waitForFunction(() => !!(window as unknown as UploadsHarness).uploadsTest);
      await page.evaluate((input) => (window as unknown as UploadsHarness).uploadsTest.configure(input), { apiOrigin: origin, token, accountId: 'account-a', conversationId: 'conversation-a' });
      const seen: { method: string; path: string; body: unknown }[] = [];
      await page.route('**/v1/**', async (route) => { seen.push({ method: route.request().method(), path: new URL(route.request().url()).pathname, body: JSON.parse(route.request().postData() ?? '{}') }); await route.continue(); });
      const outcome = await page.evaluate(() => (window as unknown as UploadsHarness).uploadsTest.confirm('read-only-upload-identity'));
      expect(outcome).toBe('unavailable');
      await expect(page.locator('[data-confirm]')).toHaveText('Confirming this upload is not available yet. No version was created.');
      expect(seen).toHaveLength(1);
      expect(seen[0]).toMatchObject({ method: 'POST', path: '/v1/uploads/read-only-upload-identity/confirm' });
      expect(typeof (seen[0]!.body as Record<string, unknown>).operationId).toBe('string');
      await page.unroute('**/v1/**');
    }, { browserOrigin: 'http://127.0.0.1:4179' });
  } finally { for (const finish of cleanup.reverse()) await finish(); }
});

test('picker filters and selects locally and attaches the exact versions against the built backend', async ({ page }, info) => {
  test.setTimeout(120000);
  await info.attach('prerequisite', { body: 'Read-only Library item page and labelled display facts supplied by the isolated composition. Production Library reads remain unavailable; attach is sent to the built loopback backend and is not fulfilled.', contentType: 'text/plain' });
  const { verifyBuiltAdmission } = await import(pathToFileURL(resolve('apps/api/.test-build/test/auth-built-fixture.js')).href) as { verifyBuiltAdmission: typeof VerifyBuiltAdmission };
  const cleanup: (() => void | Promise<void>)[] = [];
  try {
    await verifyBuiltAdmission({ diagnostic(message) { console.log(message); }, after(fn) { cleanup.push(fn); } }, async ({ origin, accessTokens: [token] }) => {
      requests.length = 0;
      await openPicker(page, origin, token, { conversationId: 'conversation-a' });
      await expect(page.getByRole('heading', { name: 'Library', exact: true })).toBeVisible();
      await expect(page.locator('.wp-picker-pill')).toHaveText(['All', 'Characters', 'Places', 'Props']);
      await expect(page.locator('.wp-picker-tile .wp-picker-label')).toHaveText(labels);
      await expect(page.locator('.wp-picker-tile img')).toHaveCount(4);
      expect(requests).toEqual([{ method: 'GET', path: '/v1/library', body: null }]);
      await page.getByRole('button', { name: 'Characters', exact: true }).click();
      await expect(page.locator('.wp-picker-label')).toHaveText(['Vale', 'Mercer']);
      await page.getByRole('button', { name: 'All', exact: true }).click();
      await expect(page.locator('.wp-picker-label')).toHaveText(labels);
      await page.getByRole('textbox', { name: 'Search Library', exact: true }).fill('val');
      await expect(page.locator('.wp-picker-label')).toHaveText(['Vale']);
      await page.getByRole('textbox', { name: 'Search Library', exact: true }).fill('zzz');
      await expect(page.locator('.wp-picker-empty b')).toHaveText('No matching items');
      await expect(page.locator('.wp-picker-empty span')).toHaveText('Search only looks at the names shown here.');
      await page.getByRole('textbox', { name: 'Search Library', exact: true }).fill('');
      const seen: { method: string; path: string; body: Record<string, unknown> }[] = [];
      await page.route('**/v1/**', async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === '/v1/library') { await route.continue(); return; }
        seen.push({ method: route.request().method(), path: url.pathname, body: JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown> });
        await route.continue();
      });
      await page.locator('.wp-picker-tile').filter({ hasText: 'Vale' }).click();
      await page.locator('.wp-picker-tile').filter({ hasText: 'Bench' }).click();
      await expect(page.locator('.wp-picker-tile[aria-pressed="true"]')).toHaveCount(2);
      await expect(page.locator('.wp-picker-count')).toHaveText('2 selected');
      await expect(page.locator('.wp-picker-chip')).toHaveText(['Vale×', 'Bench×']);
      expect(seen).toEqual([]);
      await page.getByRole('button', { name: 'Remove Vale', exact: true }).click();
      await expect(page.locator('.wp-picker-count')).toHaveText('1 selected');
      await page.locator('.wp-picker-tile').filter({ hasText: 'Vale' }).click();
      expect(seen).toEqual([]);
      const attached = page.waitForResponse((value) => new URL(value.url()).pathname === '/v1/conversations/conversation-a/uses');
      await page.getByRole('button', { name: 'Attach (2)', exact: true }).click();
      expect((await attached).status()).toBe(501);
      await expect(page.locator('.wp-picker-feedback')).toHaveText('Attaching from your Library is not available yet. Nothing was attached.');
      expect(seen).toHaveLength(1);
      expect(seen[0]).toMatchObject({ method: 'POST', path: '/v1/conversations/conversation-a/uses' });
      expect(seen[0]!.body).toMatchObject({ purpose: 'reference', versionId: 'vale-v1' });
      expect(typeof seen[0]!.body.operationId).toBe('string');
      await expect(page.locator('.wp-picker-tile[aria-pressed="true"]')).toHaveCount(2);
      await expect(page.locator('.wp-picker-chip')).toHaveText(['Vale×', 'Bench×']);
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(page.locator('.wp-picker')).toHaveCount(0);
      await page.unroute('**/v1/**');
    }, { browserOrigin: 'http://127.0.0.1:4179' });
  } finally { for (const finish of cleanup.reverse()) await finish(); }
});

test('picker without facts guesses nothing and attach needs a current conversation', async ({ page }) => {
  await openPicker(page, 'http://127.0.0.1:4179', 'token', { prerequisites: {} });
  await expect(page.locator('.wp-picker-pill')).toHaveCount(0);
  await expect(page.locator('.wp-picker-tile .wp-picker-label')).toHaveText(['Reference', 'Reference', 'Image', 'Reference']);
  await expect(page.locator('.wp-picker-sub')).toHaveText(['Version 1', 'Version 1', 'Version 3', 'Version 2']);
  await expect(page.locator('.wp-picker-tile img')).toHaveCount(0);
  await expect(page.getByText('Example media omitted')).toHaveCount(0);
  await expect(page.getByText('Layout reference only')).toHaveCount(0);
  const seen: string[] = [];
  await page.route('**/v1/**', (route) => { seen.push(route.request().url()); throw new Error('No conversation means no attach or upload request'); });
  await page.locator('.wp-picker-tile').first().click();
  await expect(page.locator('.wp-picker-count')).toHaveText('1 selected');
  await expect(page.getByRole('button', { name: 'Attach (1)', exact: true })).toBeDisabled();
  expect(seen).toEqual([]);
});
