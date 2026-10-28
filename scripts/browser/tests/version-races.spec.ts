import { expect, test } from '@playwright/test';

const newerVersion = { id: 'script-v8', artifactId: 'script-example', revision: 8, kind: 'script', content: { synopsis: 'Authoritative revision 8.', retained: 'Unrelated field.' }, createdBy: 'human', createdAt: '2026-10-28T00:00:00Z', dependencies: ['reference-v1'] };
for (const action of ['save', 'use'] as const) for (const change of ['account', 'conversation', 'version'] as const) test(`late ${action} failure cannot cross a ${change} binding`, async ({ page }, info) => {
  await info.attach('race', { body: 'Labelled read-only versions; controlled responses only for late command completion.', contentType: 'text/plain' });
  await page.goto('/version.html');
  await page.waitForFunction(() => !!(window as unknown as { versionTest?: unknown }).versionTest);
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
  let done!: () => void; const completed = new Promise<void>((resolve) => { done = resolve; });
  let held = false;
  const posts: string[] = [];
  await page.route('**/v1/**', async (route) => {
    if (route.request().method() === 'POST') {
      posts.push(new URL(route.request().url()).pathname); held = true; await gate;
      try { await route.fulfill({ status: 501, json: { error: { code: 'not_implemented', message: 'Controlled late response' } } }); } finally { done(); }
    } else await route.fulfill({ status: 501, json: { error: { code: 'not_implemented', message: 'Controlled race prerequisite read' } } });
  });
  await page.evaluate((review) => (window as unknown as { versionTest: { configure(value: unknown): void } }).versionTest.configure({ apiOrigin: 'http://127.0.0.1:4179', review }), action === 'use');
  if (action === 'save') { await page.getByRole('button', { name: 'Edit What happens', exact: true }).click(); await page.getByRole('textbox').fill('Old scope draft'); await page.getByRole('button', { name: 'Save', exact: true }).click(); }
  else { await page.locator('.wp-version-history summary').click(); await page.getByRole('button', { name: 'Use this version', exact: true }).click(); }
  await expect.poll(() => held).toBe(true);
  await page.evaluate((input) => (window as unknown as { versionTest: { configure(value: unknown): void } }).versionTest.configure(input), { review: action === 'use', ...(change === 'account' ? { accountId: 'new-account' } : change === 'conversation' ? { conversationId: 'new-conversation' } : { version: newerVersion }) });
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(page.getByText(change === 'version' ? 'Authoritative revision 8.' : 'Mercer and Vale sit side by side on the gallery bench.', { exact: true })).toBeVisible();
  release(); await completed;
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.getByText('Old scope draft', { exact: true })).toHaveCount(0);
  expect(posts).toEqual([`/v1/conversations/read-only-conversation/${action === 'save' ? 'versions' : 'uses'}`]);
});

for (const resultRevision of [8, 10]) test(`raced Use revision ${resultRevision} respects newer authoritative selection`, async ({ page }, info) => {
  await info.attach('race', { body: 'Controlled Use completion races a newer read-only current-version prop; not a persisted approval.', contentType: 'text/plain' });
  await page.goto('/version.html');
  await page.waitForFunction(() => !!(window as unknown as { versionTest?: unknown }).versionTest);
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
  let held = false;
  await page.route('**/v1/**', async (route) => {
    if (route.request().method() === 'POST') { held = true; await gate; await route.fulfill({ json: { use: { id: 'raced-use', versionId: 'script-v6', binding: { purpose: 'script' }, state: 'approved' }, selectionRevision: resultRevision } }); }
    else await route.fulfill({ status: 501, json: { error: { code: 'not_implemented', message: 'Controlled race read' } } });
  });
  await page.evaluate(() => (window as unknown as { versionTest: { configure(value: unknown): void } }).versionTest.configure({ apiOrigin: 'http://127.0.0.1:4179', review: true }));
  await page.locator('.wp-version-history summary').click();
  await page.getByRole('button', { name: 'Use this version', exact: true }).click();
  await expect.poll(() => held).toBe(true);
  await page.evaluate((version) => (window as unknown as { versionTest: { configure(value: unknown): void } }).versionTest.configure({ review: true, version }), newerVersion);
  await expect(page.locator('[data-current-version-id]')).toHaveAttribute('data-current-version-id', 'script-v8');
  const response = page.waitForResponse((value) => value.request().method() === 'POST');
  release(); await (await response).finished();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.locator('[data-current-version-id]')).toHaveAttribute('data-current-version-id', resultRevision > 9 ? 'script-v6' : 'script-v8');
  await expect(page.locator('[data-displayed-version-id]')).toHaveAttribute('data-displayed-version-id', 'script-v8');
});
