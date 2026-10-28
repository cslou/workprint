import type { Page } from '@playwright/test';
import { expect, test } from '../material-network.js';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import type { verifyBuiltAdmission as VerifyBuiltAdmission } from '../../../apps/api/test/auth-built-fixture.js';

type Harness = { exportsTest: { configure(input: unknown): void; unmount(): void; remount(): void } };
const local = 'http://127.0.0.1:4179';
async function mount(page: Page, input: unknown) {
  await page.goto('/exports.html');
  await page.waitForFunction(() => !!(window as unknown as Harness).exportsTest);
  await page.evaluate(input => (window as unknown as Harness).exportsTest.configure(input), input);
}
const choiceIds = (page: Page) => page.locator('.wp-video-row [data-current-version-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-current-version-id')));

test('actual Videos Export, history, detail and download receive built 401/501 without effects', async ({ page, materialNetwork }, info) => {
  test.setTimeout(180000);
  await info.attach('prerequisite', { body: 'Labelled read-only public workspace, exact video and two export projections. No producer/success response is mocked. Every application request is continued to built backend admission.', contentType: 'text/plain' });
  const { verifyBuiltAdmission } = await import(pathToFileURL(resolve('apps/api/.test-build/test/auth-built-fixture.js')).href) as { verifyBuiltAdmission: typeof VerifyBuiltAdmission };
  const cleanup: (() => void | Promise<void>)[] = [];
  try {
    await verifyBuiltAdmission({ diagnostic(message) { console.log(message); }, after(fn) { cleanup.push(fn); } }, async ({ origin, accessTokens }) => {
      for (const [token, status] of [[accessTokens[0], 501], [null, 401]] as const) {
        materialNetwork.expectOperations(
          { origin, method: 'GET', path: '/v1/versions/video-exact', count: 2, query: {} },
          { origin, method: 'GET', path: '/v1/conversations/conversation-a/generation-requests', count: 1, query: {} },
          { origin, method: 'GET', path: '/v1/conversations/conversation-a/exports', count: 2, query: {} },
          { origin, method: 'POST', path: '/v1/conversations/conversation-a/exports', count: 2, query: {} },
          { origin, method: 'GET', path: '/v1/exports/export-exact', count: 1, query: {} },
          { origin, method: 'GET', path: '/v1/versions/output-exact/media', count: 1, query: {} },
        );
        await mount(page, { apiOrigin: origin, token, prerequisites: true });
        await expect(page.locator('.wp-video-row')).toHaveCount(1);
        await expect(page.getByText(status === 501 ? 'Generation requests are not available yet.' : 'Sign-in required to load generation requests.', { exact: true })).toBeVisible();
        const initialChoice = await choiceIds(page);
        expect(initialChoice).toEqual(['video-earlier']);
        await page.getByRole('button', { name: 'Export history', exact: true }).click();
        await expect(page.getByText('No export records were loaded.', { exact: true })).toBeVisible();
        const before = await page.locator('.wp-export-card').allTextContents();
        expect(before).toHaveLength(2);
        await page.keyboard.press('Escape');
        const commands: unknown[] = [];
        let files = 0, navigations = 0, popups = 0;
        const downloaded = () => { files++; }, navigated = () => { navigations++; }, opened = () => { popups++; };
        page.on('download', downloaded); page.on('framenavigated', navigated); page.on('popup', opened);
        for (let attempt = 0; attempt < 2; attempt++) {
          const response = page.waitForResponse(value => value.request().method() === 'POST' && value.url() === `${origin}/v1/conversations/conversation-a/exports`);
          await page.getByRole('button', { name: 'Export', exact: true }).click();
          const result = await response;
          expect(result.status()).toBe(status);
          commands.push(result.request().postDataJSON());
          await expect(page.getByText('No export was queued and no file was created.', { exact: true })).toBeVisible();
          await expect(page.locator('.wp-export-facts')).toHaveCount(0);
          await page.keyboard.press('Escape');
          await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeFocused();
        }
        expect(commands).toEqual(Array.from({ length: 2 }, () => ({ operationId: expect.stringMatching(/^[0-9a-f-]{36}$/), selectionRevision: 17 })));
        expect((commands[0] as { operationId: string }).operationId).not.toBe((commands[1] as { operationId: string }).operationId);
        await page.getByRole('button', { name: 'Export history', exact: true }).click();
        await expect(page.getByText('No export records were loaded.', { exact: true })).toBeVisible();
        expect(await page.locator('.wp-export-card').allTextContents()).toEqual(before);
        const detail = page.waitForResponse(value => value.url() === `${origin}/v1/exports/export-exact`);
        await page.getByRole('button', { name: 'Export details, export 1 of 2', exact: true }).click();
        expect((await detail).status()).toBe(status);
        await expect(page.getByText('No export record was loaded.', { exact: true })).toBeVisible();
        const media = page.waitForResponse(value => value.url() === `${origin}/v1/versions/output-exact/media`);
        await page.getByRole('button', { name: 'Download', exact: true }).click();
        expect((await media).status()).toBe(status);
        await expect(page.getByText('Download is not available yet.', { exact: true })).toBeVisible();
        await expect(page.getByText('No file was downloaded.', { exact: true })).toBeVisible();
        await expect(page.locator('a[download],video,[role="progressbar"]')).toHaveCount(0);
        expect(files).toBe(0); expect(navigations).toBe(0); expect(popups).toBe(0);
        await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
        expect(await choiceIds(page)).toEqual(initialChoice);
        materialNetwork.assertSafe();
        await page.evaluate(() => (window as unknown as Harness).exportsTest.unmount());
        page.off('download', downloaded); page.off('framenavigated', navigated); page.off('popup', opened);
      }
    }, { browserOrigin: local });
  } finally { for (const finish of cleanup.reverse()) await finish(); }
});

test('display fields are exact read-only projections with no opaque IDs or internal revisions', async ({ page, materialNetwork }, info) => {
  await info.attach('prerequisite', { body: 'Schema-valid isolated read-only export pages and exact video projection. Deliberately contradictory captured revision/current flag; not lifecycle/processing evidence.', contentType: 'text/plain' });
  materialNetwork.expectOperations({ origin: local, method: 'GET', path: '/v1/exports/export-failed', count: 1, query: {} });
  const record = { id: 'export-failed', status: 'processing', capturedSelectionRevision: 999, current: false, sources: [{ shotId: 'shot-exact', versionId: 'video-exact', order: 8 }, { shotId: 'unknown-shot', versionId: 'video-exact', order: 2 }, { shotId: 'shot-exact', versionId: 'unknown-version', order: 3 }], compatibility: { compatible: false, issues: [{ versionId: 'video-exact', message: 'Literal issue.' }, { versionId: 'unknown-version', message: 'Other issue.' }] }, failureReason: 'Literal failure.' };
  await page.route('**/v1/exports/export-failed', route => route.fulfill({ json: record }));
  await mount(page, { apiOrigin: local, mode: 'detail', recordId: record.id });
  await expect(page.locator('.wp-export-facts .wp-status')).toHaveText('Processing');
  await expect(page.locator('.wp-export-hint')).toHaveText('Uses earlier chosen versions.');
  await expect(page.locator('.wp-export-facts li')).toHaveText(['Not in the current Videos list', 'Not in the current Videos list', 'Shot 1 · Version 4']);
  // Ambiguous version appearing under two different Shot IDs cannot resolve an issue to a guessed Shot.
  await expect(page.locator('.wp-export-facts section').nth(1)).toHaveText("Can't be combinedNot in the current Videos list — Literal issue.Not in the current Videos list — Other issue.");
  await expect(page.locator('.wp-export-facts section').nth(2)).toHaveText('Why it failedLiteral failure.');
  await expect(page.getByRole('button', { name: 'Download', exact: true })).toHaveCount(0);
  const text = await page.locator('.wp-export-facts').innerText();
  for (const hidden of ['export-failed', 'shot-exact', 'video-exact', 'unknown-shot', 'unknown-version', '999', 'Order']) expect(text).not.toContain(hidden);
});

test('compatible detail omits issues and absent failure while preserving independent currentness', async ({ page, materialNetwork }) => {
  materialNetwork.expectOperations({ origin: local, method: 'GET', path: '/v1/exports/export-exact', count: 1, query: {} });
  await page.route('**/v1/exports/export-exact', route => route.fulfill({ json: { id: 'export-exact', status: 'cancelled', capturedSelectionRevision: 1, current: true, sources: [], compatibility: { compatible: true, issues: [{ versionId: 'hidden', message: 'Must stay hidden.' }] } } }));
  await mount(page, { apiOrigin: local, mode: 'detail' });
  await expect(page.locator('.wp-export-facts .wp-status')).toHaveText('Cancelled');
  await expect(page.locator('.wp-export-hint')).toHaveText('Uses your current chosen versions.');
  await expect(page.locator('.wp-export-facts section')).toHaveCount(1);
  await expect(page.getByText('Must stay hidden.')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Download', exact: true })).toHaveCount(0);
});

test('transport failures leave no record, download link or selection command', async ({ page, materialNetwork }) => {
  materialNetwork.expectOperations(
    { origin: local, method: 'POST', path: '/v1/conversations/conversation-a/exports', count: 1, query: {} },
    { origin: local, method: 'GET', path: '/v1/conversations/conversation-a/exports', count: 1, query: {} },
    { origin: local, method: 'GET', path: '/v1/exports/export-exact', count: 1, query: {} },
    { origin: local, method: 'GET', path: '/v1/versions/output-exact/media', count: 1, query: {} },
  );
  await page.route('**/v1/**', route => route.abort('failed'));
  await mount(page, { apiOrigin: local, mode: 'entry' });
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.getByText('No export was queued and no file was created.', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Export history', exact: true }).click();
  await expect(page.getByText('No export records were loaded.', { exact: true })).toBeVisible();
  await expect(page.locator('.wp-export-card')).toHaveCount(0);
  await page.evaluate(() => (window as unknown as Harness).exportsTest.configure({ apiOrigin: 'http://127.0.0.1:4179', mode: 'detail' }));
  await expect(page.getByText('No export record was loaded.', { exact: true })).toBeVisible();
  await page.evaluate(() => (window as unknown as Harness).exportsTest.configure({ apiOrigin: 'http://127.0.0.1:4179', mode: 'download' }));
  await expect(page.getByText('No file was downloaded.', { exact: true })).toBeVisible();
  await expect(page.locator('a[download],video,[role="progressbar"]')).toHaveCount(0);
});
