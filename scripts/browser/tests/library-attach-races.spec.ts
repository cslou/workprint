import { expect, test } from '../material-network.js';

const items = ['alpha', 'beta', 'gamma'].map(id => ({ id, kind: 'reference', builtIn: false, latestVersion: { id: `${id}-v1`, artifactId: id, revision: 1, kind: 'reference', content: {}, createdBy: 'human', createdAt: '2026-10-29T00:00:00Z', dependencies: [] } }));
const display = Object.fromEntries(items.map(item => [item.latestVersion.id, { name: item.id, category: 'Props', tileLabel: 'Prop' }]));

test('pending Attach locks selection and double press cannot duplicate the sequence', async ({ page, materialNetwork }, info) => {
  const origin = 'http://127.0.0.1:4179';
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
  await page.evaluate(display => (window as unknown as { shellTest: { configure(input: unknown): void } }).shellTest.configure({ session: { accountId: 'account-a', name: 'Creator' }, conversationId: 'conversation-a', apiOrigin: 'http://127.0.0.1:4179', token: null, libraryPrerequisites: { display } }), display);
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
