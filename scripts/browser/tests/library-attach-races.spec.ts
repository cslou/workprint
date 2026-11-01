import { browserOrigin } from '../origin.js';
import { expect, test } from '../material-network.js';

const items = ['alpha', 'beta', 'gamma'].map(id => ({ id, kind: 'reference', builtIn: false, latestVersion: { id: `${id}-v1`, artifactId: id, revision: 1, kind: 'reference', content: {}, createdBy: 'human', createdAt: '2026-10-29T00:00:00Z', dependencies: [] } }));
const display = Object.fromEntries(items.map(item => [item.latestVersion.id, { name: item.id, category: 'Props', tileLabel: 'Prop' }]));

test('pending Attach locks selection and double press cannot duplicate the sequence', async ({ page, materialNetwork }, info) => {
  const origin = browserOrigin;
  materialNetwork.expectOperations(
    { origin, method: 'GET', path: '/v1/conversations/conversation-a/workspace', count: 1, query: {} },
    { origin, method: 'GET', path: '/v1/library', count: 1, query: {} },
    { origin, method: 'POST', path: '/v1/conversations/conversation-a/uses', count: 2, query: {} },
  );
  await info.attach('prerequisite', { body: 'Read-only Library projections and held validated acknowledgements, solely for sequence reconciliation; not persisted product success.', contentType: 'text/plain' });
  const held: { id: string; release(): Promise<void> }[] = [];
  await page.route('**/v1/library*', route => route.fulfill({ json: { items, nextCursor: null } }));
  await page.route('**/v1/conversations/*/uses', async route => {
    const body = route.request().postDataJSON() as { versionId: string; purpose: string };
    expect(body.purpose).toBe('reference');
    await new Promise<void>(resolve => held.push({ id: body.versionId, async release() { await route.fulfill({ json: { use: { id: `use-${body.versionId}`, versionId: body.versionId, state: 'approved', binding: { purpose: 'reference' } }, selectionRevision: held.length } }); resolve(); } }));
  });
  await page.goto('/shell.html');
  await page.waitForFunction(() => !!(window as unknown as { shellTest?: unknown }).shellTest);
  await page.evaluate(display => (window as unknown as { shellTest: { configure(input: unknown): void } }).shellTest.configure({ session: { accountId: 'account-a', name: 'Creator' }, conversationId: 'conversation-a', apiOrigin: window.location.origin, token: null, libraryPrerequisites: { display } }), display);
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  const tiles = page.locator('.wp-picker-tile');
  await tiles.nth(0).click(); await tiles.nth(1).click();
  const attach = page.getByRole('button', { name: 'Attach (2)', exact: true });
  await attach.click(); await expect.poll(() => held.length).toBe(1);
  await expect(attach).toBeDisabled();
  for (const tile of await tiles.all()) await expect(tile).toBeDisabled();
  for (const remove of await page.locator('.wp-picker-chip button').all()) await expect(remove).toBeDisabled();
  await attach.click({ force: true });
  await tiles.nth(2).click({ force: true });
  await page.getByRole('button', { name: 'Remove beta', exact: true }).click({ force: true });
  await expect(page.locator('.wp-picker-chip')).toHaveText(['alpha×', 'beta×']);
  expect(held.map(value => value.id)).toEqual(['alpha-v1']);
  await expect(page.getByRole('button', { name: 'Props', exact: true })).toBeEnabled();
  await expect(page.getByRole('textbox', { name: 'Search Library', exact: true })).toBeEnabled();
  await held[0]!.release(); await expect.poll(() => held.length).toBe(2);
  expect(held.map(value => value.id)).toEqual(['alpha-v1', 'beta-v1']);
  await held[1]!.release();
  await expect(page.locator('.wp-picker-count')).toHaveText('Nothing selected yet');
  await expect(tiles.nth(2)).toBeEnabled();
});

test('a URL-restored conversation reflects a Library use once its thread loads', async ({ page, materialNetwork }, info) => {
  const origin = browserOrigin, conversation = '7d9f1c2e-4b3a-4c5d-8e6f-0a1b2c3d4e5f', accountId = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
  materialNetwork.expectOperations(
    { origin, method: 'GET', path: `/v1/conversations/${conversation}/workspace`, count: 1, query: {} },
    { origin, method: 'GET', path: '/v1/library', count: 1, query: {} },
    { origin, method: 'POST', path: `/v1/conversations/${conversation}/uses`, count: 1, query: {} },
  );
  await info.attach('prerequisite', { body: 'Held native thread read and read-only Library/workspace projections, solely to order restore before attach; not persisted product success.', contentType: 'text/plain' });
  await page.route('**/v1/library*', route => route.fulfill({ json: { items: items.slice(0, 1), nextCursor: null } }));
  await page.route(`**/v1/conversations/${conversation}/workspace`, route => route.fulfill({ json: { script: null, assets: [], storyboard: { work: null, shots: [] }, videos: [], pendingQuestion: null, activeWork: [], selectionRevision: 0 } }));
  await page.route(`**/v1/conversations/${conversation}/uses`, route => route.fulfill({ json: { use: { id: 'use-alpha', versionId: 'alpha-v1', state: 'approved', binding: { purpose: 'reference' } }, selectionRevision: 1 } }));
  await page.goto('/shell.html');
  await page.waitForFunction(() => !!(window as unknown as { shellTest?: unknown }).shellTest);
  await page.evaluate(input => (window as unknown as { shellTest: { configure(input: unknown): void } }).shellTest.configure({ session: { accountId: input.accountId, name: 'Creator' }, conversationId: input.conversation, apiOrigin: window.location.origin, token: null, libraryPrerequisites: { display: input.display }, restore: true }), { accountId, conversation, display });
  await expect(page.getByRole('main', { name: 'Conversation' })).toHaveAttribute('aria-busy', 'true');
  await page.evaluate(() => (window as unknown as { shellTest: { releaseThread(): void } }).shellTest.releaseThread());
  await expect(page.getByRole('tabpanel')).toHaveText('Workspace revision 0');
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.locator('.wp-picker-tile').first().click();
  await page.getByRole('button', { name: 'Attach (1)', exact: true }).click();
  await expect(page.locator('.wp-picker-count')).toHaveText('Nothing selected yet');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('tabpanel')).toHaveText('Workspace revision 1');
});
