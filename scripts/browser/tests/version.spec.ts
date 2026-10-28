import { expect, test } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import type { verifyBuiltAdmission as VerifyBuiltAdmission } from '../../../apps/api/test/auth-built-fixture.js';

const initial = 'Mercer and Vale sit side by side on the gallery bench.';

test('earlier history views are read-only and the supplied-version pencil returns on collapse', async ({ page }) => {
  await page.goto('/version.html'); await page.waitForFunction(() => !!(window as unknown as { versionTest?: unknown }).versionTest);
  await page.route('**/v1/**', () => { throw new Error('Local history inspection must not issue commands'); });
  await page.evaluate(() => (window as unknown as { versionTest: { configure(value: unknown): void } }).versionTest.configure({ review: true }));
  await expect(page.getByRole('button', { name: 'Edit What happens', exact: true })).toBeVisible();
  await page.locator('.wp-version-history summary').click();
  await page.getByRole('button', { name: 'View version 6', exact: true }).click();
  await expect(page.getByText('Earlier Script text.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit What happens', exact: true })).toHaveCount(0);
  await page.locator('.wp-version-history summary').click();
  await expect(page.getByRole('button', { name: 'Edit What happens', exact: true })).toBeVisible();
});

for (const identity of ['account', 'conversation', 'artifact']) test(`supplied draft survives history return but clears on ${identity} change`, async ({ page }) => {
  await page.goto('/version.html'); await page.waitForFunction(() => !!(window as unknown as { versionTest?: unknown }).versionTest);
  const commands: string[] = [];
  await page.route('**/v1/**', (route) => { commands.push(route.request().method()); throw new Error('Local inspection must not send a save or use'); });
  await page.evaluate(() => (window as unknown as { versionTest: { configure(value: unknown): void } }).versionTest.configure({ review: true }));
  await page.getByRole('button', { name: 'Edit What happens', exact: true }).click();
  const draft = 'Exact unsaved text.\nSecond line stays unchanged.';
  await page.getByRole('textbox').fill(draft);
  await page.locator('.wp-version-history summary').click(); await page.getByRole('button', { name: 'View version 6', exact: true }).click();
  await expect(page.getByText('Earlier Script text.', { exact: true })).toBeVisible();
  await page.locator('.wp-version-history summary').click();
  await expect(page.getByRole('textbox')).toHaveValue(draft);
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
  await expect(page.locator('[data-displayed-version-id]')).toHaveAttribute('data-displayed-version-id', 'script-v7');
  await page.evaluate((input) => (window as unknown as { versionTest: { configure(value: unknown): void } }).versionTest.configure(input), { review: true, ...(identity === 'account' ? { accountId: 'other-account' } : identity === 'conversation' ? { conversationId: 'other-conversation' } : { version: { id: 'other-v7', artifactId: 'other-artifact', revision: 7, kind: 'script', content: { synopsis: initial }, createdBy: 'human', createdAt: '2026-10-28T00:00:00Z', dependencies: [] } }) });
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(page.getByText(initial, { exact: true })).toBeVisible();
  expect(commands).toEqual([]);
});

test('aborted Save and Use retain draft, exact view and selection through tab navigation', async ({ page }, info) => {
  await info.attach('prerequisite', { body: 'Read-only exact-version material projections; actual fetch requests are aborted, never replaced by successful product responses.', contentType: 'text/plain' });
  await page.goto('/material.html');
  await page.waitForFunction(() => !!(window as unknown as { materialTest?: unknown }).materialTest);
  const mutations: string[] = [];
  await page.route('**/v1/**', async (route) => { if (route.request().method() === 'POST') mutations.push(new URL(route.request().url()).pathname); await route.abort('failed'); });
  await page.evaluate(() => (window as unknown as { materialTest: { configure(value: unknown): void } }).materialTest.configure({ prerequisites: true, apiOrigin: 'http://127.0.0.1:4179' }));
  await page.getByRole('button', { name: 'Edit What happens', exact: true }).click();
  await page.getByRole('textbox').fill('Draft retained after transport failures');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Changes were not saved. Your unsaved text is retained.');
  await expect(page.locator('[data-displayed-version-id]')).toHaveAttribute('data-displayed-version-id', 'script-v7');
  await expect(page.locator('[data-current-version-id]')).toHaveAttribute('data-current-version-id', 'script-v7');
  await page.getByRole('tab', { name: 'Assets', exact: true }).click();
  await page.getByRole('tab', { name: 'Script', exact: true }).click();
  await expect(page.getByRole('textbox')).toHaveValue('Draft retained after transport failures');
  await page.locator('.wp-version-history summary').click();
  await page.getByRole('button', { name: 'Use this version', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(['Changes were not saved. Your unsaved text is retained.', 'This version was not selected. The current selection is unchanged.']);
  await page.getByRole('tab', { name: 'Assets', exact: true }).click();
  await page.getByRole('tab', { name: 'Script', exact: true }).click();
  await expect(page.getByRole('textbox')).toHaveValue('Draft retained after transport failures');
  await expect(page.locator('[data-displayed-version-id]')).toHaveAttribute('data-displayed-version-id', 'script-v7');
  await expect(page.locator('[data-current-version-id]')).toHaveAttribute('data-current-version-id', 'script-v7');
  expect(mutations).toEqual(['/v1/conversations/read-only-conversation/versions', '/v1/conversations/read-only-conversation/uses']);
});

test('collapsing history explicitly returns from an earlier version to the supplied current version without selecting it', async ({ page }) => {
  await page.goto('/version.html');
  await page.waitForFunction(() => !!(window as unknown as { versionTest?: unknown }).versionTest);
  const reads: string[] = [];
  await page.route('**/v1/**', async (route) => { expect(route.request().method()).toBe('GET'); reads.push(new URL(route.request().url()).pathname); await route.abort('failed'); });
  await page.evaluate(() => (window as unknown as { versionTest: { configure(value: unknown): void } }).versionTest.configure({ apiOrigin: 'http://127.0.0.1:4179', review: true }));
  await page.locator('.wp-version-history summary').click();
  await page.getByRole('button', { name: 'View version 6', exact: true }).click();
  await expect(page.locator('[data-displayed-version-id]')).toHaveAttribute('data-displayed-version-id', 'script-v6');
  await expect(page.getByText('Earlier Script text.', { exact: true })).toBeVisible();
  await page.locator('.wp-version-history summary').click();
  await expect(page.locator('[data-displayed-version-id]')).toHaveAttribute('data-displayed-version-id', 'script-v7');
  await expect(page.getByText(initial, { exact: true })).toBeVisible();
  await expect(page.locator('[data-current-version-id]')).toHaveAttribute('data-current-version-id', 'script-v7');
  await expect.poll(() => reads).toEqual(['/v1/versions/script-v7', '/v1/artifacts/script-example/versions', '/v1/versions/script-v6', '/v1/versions/script-v7']);
});

test('section editing is local and Cancel restores the exact displayed version', async ({ page }) => {
  await page.goto('/version.html');
  await page.waitForFunction(() => !!(window as unknown as { versionTest?: unknown }).versionTest);
  await page.evaluate(() => (window as unknown as { versionTest: { configure(value: unknown): void } }).versionTest.configure({}));
  const mutations: string[] = [];
  await page.route('**/v1/**', async (route) => { mutations.push(route.request().method()); throw new Error('Viewing/editing/Cancel must not send application requests'); });
  await page.getByRole('button', { name: 'Edit What happens', exact: true }).click();
  await page.getByRole('textbox', { name: 'What happens', exact: true }).fill('Unsaved change');
  expect(await page.locator('.wp-version-edit-actions button').allTextContents()).toEqual(['Cancel', 'Save']);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByText(initial, { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  expect(mutations).toEqual([]);
});

test('exact Save uses real admission, retains unsaved text and does not change the displayed version on 401/501', async ({ page }, info) => {
  test.setTimeout(120000);
  await info.attach('prerequisite', { body: 'Read-only public version and explicit synopsis field mapping; not persisted product work.', contentType: 'text/plain' });
  const { verifyBuiltAdmission } = await import(pathToFileURL(resolve('apps/api/.test-build/test/auth-built-fixture.js')).href) as { verifyBuiltAdmission: typeof VerifyBuiltAdmission };
  const cleanup: (() => void | Promise<void>)[] = [];
  try {
    await verifyBuiltAdmission({ diagnostic(message) { console.log(message); }, after(fn) { cleanup.push(fn); } }, async ({ origin, accessTokens }) => {
      for (const [token, status, feedback] of [[accessTokens[0], 501, 'Saving is not available yet. Your unsaved text is retained.'], [null, 401, 'Sign-in required to save. Your unsaved text is retained.']] as const) {
        await page.goto('/version.html');
        await page.waitForFunction(() => !!(window as unknown as { versionTest?: unknown }).versionTest);
        const requests: { path: string; body: unknown }[] = [];
        await page.route('**/*', async (route) => {
          const url = new URL(route.request().url());
          if (!['http://127.0.0.1:4179', origin].includes(url.origin)) throw new Error('Unauthorized version egress');
          if (url.origin === origin) requests.push({ path: url.pathname, body: route.request().method() === 'POST' ? route.request().postDataJSON() : null });
          await route.continue();
        });
        await page.evaluate((input) => (window as unknown as { versionTest: { configure(value: unknown): void } }).versionTest.configure(input), { apiOrigin: origin, token });
        await page.getByRole('button', { name: 'Edit What happens', exact: true }).click();
        await page.getByRole('textbox', { name: 'What happens', exact: true }).fill('Mercer stays still, then gives a small nod.');
        const response = page.waitForResponse((value) => value.url() === `${origin}/v1/conversations/read-only-conversation/versions`);
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        expect((await response).status()).toBe(status);
        await expect(page.getByRole('status')).toHaveText(feedback);
        await expect(page.getByRole('textbox')).toHaveValue('Mercer stays still, then gives a small nod.');
        expect(requests).toEqual([{ path: '/v1/conversations/read-only-conversation/versions', body: { operationId: expect.stringMatching(/^[0-9a-f-]{36}$/), artifactId: 'script-example', kind: 'script', baseVersionId: 'script-v7', dependencies: ['reference-v1'], content: { synopsis: 'Mercer stays still, then gives a small nod.', retained: 'Keep this unrelated field.' } } }]);
        await expect(page.locator('[data-version-id]')).toHaveAttribute('data-version-id', 'script-v7');
        await page.getByRole('button', { name: 'Cancel', exact: true }).click();
        await expect(page.getByText(initial, { exact: true })).toBeVisible();
        await page.unrouteAll({ behavior: 'wait' });
      }
    }, { browserOrigin: 'http://127.0.0.1:4179' });
  } finally { for (const fn of cleanup.reverse()) await fn(); }
});

test('history viewing stays read-only, binds the requested older version, and exact Use failures preserve selection', async ({ page }, info) => {
  test.setTimeout(120000);
  await info.attach('prerequisite', { body: 'Read-only current/earlier public versions, selected use and explicit field mapping; not saved product records.', contentType: 'text/plain' });
  const { verifyBuiltAdmission } = await import(pathToFileURL(resolve('apps/api/.test-build/test/auth-built-fixture.js')).href) as { verifyBuiltAdmission: typeof VerifyBuiltAdmission };
  const cleanup: (() => void | Promise<void>)[] = [];
  try {
    await verifyBuiltAdmission({ diagnostic(message) { console.log(message); }, after(fn) { cleanup.push(fn); } }, async ({ origin, accessTokens }) => {
      for (const [token, status, feedback] of [[accessTokens[0], 501, 'Using this version is not available yet. The current selection is unchanged.'], [null, 401, 'Sign-in required to use this version. The current selection is unchanged.']] as const) {
        await page.goto('/version.html');
        await page.waitForFunction(() => !!(window as unknown as { versionTest?: unknown }).versionTest);
        let allowMutation = false;
        const requests: { method: string; path: string; body: unknown }[] = [];
        await page.route('**/*', async (route) => {
          const url = new URL(route.request().url());
          if (!['http://127.0.0.1:4179', origin].includes(url.origin)) throw new Error('Unauthorized history egress');
          if (url.origin === origin) {
            if (route.request().method() !== 'GET' && !allowMutation) throw new Error('Viewing/history attempted a mutation');
            requests.push({ method: route.request().method(), path: url.pathname, body: route.request().method() === 'POST' ? route.request().postDataJSON() : null });
          }
          await route.continue();
        });
        await page.evaluate((input) => (window as unknown as { versionTest: { configure(value: unknown): void } }).versionTest.configure(input), { apiOrigin: origin, token, review: true });
        await expect.poll(() => requests.length).toBe(1);
        await page.locator('.wp-version-history summary').click();
        await expect.poll(() => requests.length).toBe(2);
        await page.getByRole('button', { name: 'View version 6', exact: true }).click();
        await expect.poll(() => requests.length).toBe(3);
        await expect(page.locator('[data-displayed-version-id]')).toHaveAttribute('data-displayed-version-id', 'script-v6');
        await expect(page.getByText('Earlier Script text.', { exact: true })).toBeVisible();
        expect(requests.map(({ method, path }) => ({ method, path }))).toEqual([{ method: 'GET', path: '/v1/versions/script-v7' }, { method: 'GET', path: '/v1/artifacts/script-example/versions' }, { method: 'GET', path: '/v1/versions/script-v6' }]);
        allowMutation = true;
        const response = page.waitForResponse((value) => value.url() === `${origin}/v1/conversations/read-only-conversation/uses`);
        await page.getByRole('button', { name: 'Use this version', exact: true }).click();
        expect((await response).status()).toBe(status);
        await expect(page.getByRole('status')).toHaveText(feedback);
        expect(requests[3]).toEqual({ method: 'POST', path: '/v1/conversations/read-only-conversation/uses', body: { purpose: 'script', versionId: 'script-v6', operationId: expect.stringMatching(/^[0-9a-f-]{36}$/) } });
        await expect(page.locator('[data-current-version-id]')).toHaveAttribute('data-current-version-id', 'script-v7');
        await expect(page.locator('[data-displayed-version-id]')).toHaveAttribute('data-displayed-version-id', 'script-v6');
        expect(requests).toHaveLength(4);
        await page.unrouteAll({ behavior: 'wait' });
      }
    }, { browserOrigin: 'http://127.0.0.1:4179' });
  } finally { for (const fn of cleanup.reverse()) await fn(); }
});

test('client validation failure retains text; inherited fields are not editable', async ({ page }) => {
  await page.goto('/version.html');
  await page.waitForFunction(() => !!(window as unknown as { versionTest?: unknown }).versionTest);
  await page.evaluate(() => (window as unknown as { versionTest: { configure(value: unknown): void } }).versionTest.configure({ apiOrigin: 'http://127.0.0.1:4179', conversationId: '.' }));
  await page.getByRole('button', { name: 'Edit What happens', exact: true }).click();
  await page.getByRole('textbox').fill('Retained invalid-input edit');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Changes were not saved. Your unsaved text is retained.');
  await expect(page.getByRole('textbox')).toHaveValue('Retained invalid-input edit');
  await page.evaluate(() => (window as unknown as { versionTest: { configure(value: unknown): void } }).versionTest.configure({ field: 'constructor' }));
  await expect(page.getByRole('button', { name: 'Edit What happens', exact: true })).toHaveCount(0);
});
