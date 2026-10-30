import { randomUUID } from 'node:crypto';
import { test, expect } from '../material-network.js';
import { fixture, privateForward, privateFulfill, privateAbort } from '../account-fixture.js';
import { allowHistory, allowList, enter, settledFrames } from '../navigation-fixture.js';

for (const reference of ['foreign', 'absent'] as const) test(`safe ${reference} native history does not expose identity or initiate workspace reads`, async ({ page, materialNetwork }) => {
  test.setTimeout(120000); const f = await fixture(page, true);
  try {
    const user = await f.auth.createAccount(), other = await f.auth.createAccount();
    const foreign = await f.application!.saveNative(other.id, [{ role: 'assistant', text: 'Foreign private message' }], 'Foreign private title');
    const id = reference === 'foreign' ? foreign.id : randomUUID();
    allowHistory(materialNetwork, f.application!.apiOrigin, user.id, id, 1, false);
    await enter(page, materialNetwork, f, user, id);
    await expect(page.getByText('This conversation isn’t available.', { exact: true })).toBeVisible();
    await expect(page.getByText('Foreign private title', { exact: true })).not.toBeVisible();
    await expect(page.getByText('Foreign private message', { exact: true })).not.toBeVisible();
    expect(materialNetwork.entries.filter(entry => entry.url.pathname.startsWith('/v1/'))).toEqual([]);
  } finally { await f.close(); }
});

for (const width of [1440, 390]) test(`native history identities/text/order and earlier-page anchor at ${width}`, async ({ page, materialNetwork }) => {
  test.setTimeout(120000); await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  const f = await fixture(page, true);
  try {
    const user = await f.auth.createAccount();
    const text = (index: number) => `Exact saved message ${index}: <script>not executable</script> ${'unbroken_'.repeat(index === 10 ? 30 : 2)}`;
    const saved = await f.application!.saveNative(user.id, Array.from({ length: 25 }, (_, index) => ({ role: index % 2 ? 'assistant' as const : 'user' as const, text: text(index) })), 'Saved history with exact identities');
    const expected = await f.application!.readNative(user.id, saved.id);
    const before = await f.application!.snapshot(); allowHistory(materialNetwork, f.application!.apiOrigin, user.id, saved.id);
    await enter(page, materialNetwork, f, user, saved.id);
    await expect(page.getByRole('heading', { name: saved.title!, exact: true })).toBeFocused();
    const messages = page.getByRole('list', { name: 'Saved messages' }); await expect(messages.locator('li')).toHaveCount(20);
    const anchor = messages.locator('li').first(); const anchorId = await anchor.getAttribute('data-message-id');
    const initialY = (await anchor.boundingBox())!.y;
    materialNetwork.expectOperations({ origin: f.application!.apiOrigin, method: 'GET', path: `/memory/threads/${saved.id}/messages`, query: { resourceId: user.id, page: '1', perPage: '20' }, count: 1 });
    await page.getByRole('button', { name: 'Load earlier messages', exact: true }).click();
    await expect(messages.locator('li')).toHaveCount(25); await settledFrames(page);
    expect(Math.abs((await messages.locator(`[data-message-id="${anchorId}"]`).boundingBox())!.y - initialY)).toBeLessThanOrEqual(1);
    await expect(page.getByText('Beginning of conversation.', { exact: true })).toHaveAttribute('role', 'status');
    expect(await messages.locator('li').evaluateAll(elements => elements.map(element => element.getAttribute('data-message-id')))).toEqual(expected.messages.map(message => message.id));
    expect(await messages.locator('li').allTextContents()).toEqual(Array.from({ length: 25 }, (_, index) => text(index)));
    expect(await f.application!.snapshot()).toBe(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(materialNetwork.entries.filter(entry => entry.method !== 'GET' && entry.url.pathname.startsWith('/memory/'))).toEqual([]);
  } finally { await f.close(); }
});

test('empty and failed Recents settle and read retries never create a conversation', async ({ page, materialNetwork }) => {
  test.setTimeout(120000); const f = await fixture(page, true);
  try {
    const user = await f.auth.createAccount(); await enter(page, materialNetwork, f, user);
    allowList(materialNetwork, f.application!.apiOrigin, user.id);
    await page.route('**/memory/threads?*', route => privateAbort(route));
    await page.getByRole('button', { name: 'Recents', exact: true }).click();
    const dialog = page.getByRole('dialog'); await expect(dialog).toContainText('Recents couldn’t be loaded.');
    await page.unroute('**/memory/threads?*'); allowList(materialNetwork, f.application!.apiOrigin, user.id);
    await dialog.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(dialog.getByText('No videos yet.', { exact: true })).toBeVisible();
    expect(materialNetwork.entries.filter(entry => entry.method === 'POST' && entry.url.pathname.startsWith('/memory/'))).toEqual([]);
  } finally { await f.close(); }
});

test('unknown create acknowledgement checks real Recents without an automatic mutation retry', async ({ page, materialNetwork }) => {
  test.setTimeout(120000); const f = await fixture(page, true);
  try {
    const user = await f.auth.createAccount(); await enter(page, materialNetwork, f, user);
    let createdId: string | undefined;
    await page.route('**/memory/threads', async route => { const response = await privateForward(route); createdId = (await response.json() as { id: string }).id; await privateAbort(route); });
    materialNetwork.expectOperations({ origin: f.application!.apiOrigin, method: 'POST', path: '/memory/threads', query: {}, count: 1 });
    await page.getByRole('button', { name: 'New video', exact: true }).click();
    const dialog = page.getByRole('dialog'); await expect(dialog).toContainText('We couldn’t confirm the new video.');
    await expect(dialog.getByRole('button', { name: 'Try again', exact: true })).not.toBeVisible();
    expect(createdId).toBeTruthy(); const before = await f.application!.snapshot();
    allowList(materialNetwork, f.application!.apiOrigin, user.id);
    await dialog.getByRole('button', { name: 'Open Recents', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Untitled video', exact: true })).toBeVisible();
    await settledFrames(page); expect(await f.application!.snapshot()).toBe(before);
    expect(materialNetwork.entries.filter(entry => entry.method === 'POST' && entry.url.pathname === '/memory/threads')).toHaveLength(1);
  } finally { await f.close(); }
});

test('a failed next page retains current rows and has a read-only explicit retry', async ({ page, materialNetwork }) => {
  test.setTimeout(120000); const f = await fixture(page, true);
  try {
    const user = await f.auth.createAccount(); for (let i = 0; i < 8; i++) await f.application!.saveNative(user.id, [], `Page scene ${i}`);
    await enter(page, materialNetwork, f, user); allowList(materialNetwork, f.application!.apiOrigin, user.id);
    await page.getByRole('button', { name: 'Recents', exact: true }).click(); const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Videos 1–6', { exact: true })).toBeFocused();
    const rows = await dialog.getByRole('list', { name: 'Recent videos' }).textContent();
    await page.route('**/memory/threads?*', route => privateAbort(route)); allowList(materialNetwork, f.application!.apiOrigin, user.id, 1);
    await dialog.getByRole('button', { name: 'Next', exact: true }).click(); await expect(dialog).toContainText('The next page couldn’t be loaded. This page is unchanged.');
    expect(await dialog.getByRole('list', { name: 'Recent videos' }).textContent()).toBe(rows);
    await page.unroute('**/memory/threads?*'); allowList(materialNetwork, f.application!.apiOrigin, user.id, 1);
    await dialog.getByRole('button', { name: 'Try next page again', exact: true }).click(); await expect(dialog.getByText('Videos 7–8', { exact: true })).toBeFocused();
    expect(materialNetwork.entries.filter(entry => entry.method === 'POST' && entry.url.pathname.startsWith('/memory/'))).toEqual([]);
  } finally { await f.close(); }
});

test('earlier-page real failure retains loaded history until a read-only retry settles', async ({ page, materialNetwork }) => {
  test.setTimeout(120000); const f = await fixture(page, true);
  try {
    const user = await f.auth.createAccount(); const saved = await f.application!.saveNative(user.id, Array.from({ length: 24 }, (_, index) => ({ role: 'user' as const, text: `Persistent ${index}` })), 'Earlier read failure');
    allowHistory(materialNetwork, f.application!.apiOrigin, user.id, saved.id); await enter(page, materialNetwork, f, user, saved.id);
    const messages = page.getByRole('list', { name: 'Saved messages' }); await expect(messages.locator('li')).toHaveCount(20); const old = await messages.allTextContents();
    // A real backend rejection, forwarded unmodified; no fabricated error body.
    await page.route('**/messages?*', async route => { const url = new URL(route.request().url()); url.searchParams.set('cursor', 'unsupported'); const response = await privateForward(route, { url: url.href }); await privateFulfill(route, { response }); });
    materialNetwork.expectOperations({ origin: f.application!.apiOrigin, method: 'GET', path: `/memory/threads/${saved.id}/messages`, query: { resourceId: user.id, page: '1', perPage: '20' }, count: 1 });
    await page.getByRole('button', { name: 'Load earlier messages', exact: true }).click(); await expect(page.getByText('Earlier messages couldn’t be loaded.', { exact: true })).toBeVisible();
    expect(await messages.allTextContents()).toEqual(old); await page.unroute('**/messages?*');
    materialNetwork.expectOperations({ origin: f.application!.apiOrigin, method: 'GET', path: `/memory/threads/${saved.id}/messages`, query: { resourceId: user.id, page: '1', perPage: '20' }, count: 1 });
    await page.getByRole('button', { name: 'Try again', exact: true }).click(); await expect(messages.locator('li')).toHaveCount(24);
  } finally { await f.close(); }
});
