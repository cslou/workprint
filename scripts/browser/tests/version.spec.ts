import { expect, test } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import type { verifyBuiltAdmission as VerifyBuiltAdmission } from '../../../apps/api/test/auth-built-fixture.js';

const initial = 'Mercer and Vale sit side by side on the gallery bench.';

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
