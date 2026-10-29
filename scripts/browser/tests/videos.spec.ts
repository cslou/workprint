import { browserOrigin } from '../origin.js';
import { expect, test } from '@playwright/test';
import { test as observedTest } from '../material-network.js';
import { activate } from '../activation.js';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import type { verifyBuiltAdmission as VerifyBuiltAdmission } from '../../../apps/api/test/auth-built-fixture.js';
type Harness = { storyboardTest: { configure(input: unknown): void; unmount(): void; nativeStopCalls(): number } };

test('Videos display typed candidates and every request status without claiming approval or remote stopping', async ({ page }, info) => {
  await info.attach('prerequisite', { body: 'Labelled read-only public workspace, six request-state examples and exact version projections; no persisted requests or successful mutation fixture.', contentType: 'text/plain' });
  await page.goto('/storyboard.html'); await page.waitForFunction(() => !!(window as unknown as Harness).storyboardTest);
  const methods: string[] = [];
  await page.route('**/v1/**', async route => { methods.push(route.request().method()); await route.abort('failed'); });
  await page.evaluate(() => (window as unknown as Harness).storyboardTest.configure({ composition: true, videos: true }));
  await page.getByRole('tab', { name: 'Videos', exact: true }).click();
  await expect(page.locator('.wp-video-row')).toHaveCount(1);
  await expect(page.locator('.wp-video-title')).toHaveText('First Shot');
  await expect(page.locator('.wp-video-metadata')).toHaveText('Version 2 · 5.1 s');
  await expect(page.locator('.wp-request-card .wp-status')).toHaveText(['Queued', 'Submitting', 'Running', 'Succeeded', 'Failed', 'Cancelled']);
  await expect(page.locator('.wp-request-card > b')).toHaveText(Array(6).fill('Shot 1 · Video request'));
  await expect(page.getByRole('button', { name: 'Cancel request', exact: true })).toHaveCount(3);
  await expect(page.getByText('Request status does not confirm that remote work or charges have stopped.', { exact: true })).toHaveCount(1);
  await expect(page.getByText('Last known request state', { exact: true })).toHaveCount(0);
  await expect(page.getByText(/private-remote/)).toHaveCount(0);
  await page.locator('.wp-request-card[data-request-id="request-running"] summary').click();
  await expect(page.getByText('Request details could not be loaded.', { exact: true })).toBeVisible();
  await page.locator('.wp-request-card[data-request-id="request-running"] summary').click();
  await page.evaluate(() => (window as unknown as Harness).storyboardTest.unmount());
  expect(methods.every(method => method === 'GET')).toBe(true);
  expect(await page.evaluate(() => (window as unknown as Harness).storyboardTest.nativeStopCalls())).toBe(0);
});

test('aborted cancellation preserves status and scoped feedback clears without replay or native Stop', async ({ page }) => {
  await page.goto('/storyboard.html'); await page.waitForFunction(() => !!(window as unknown as Harness).storyboardTest);
  const commands: string[] = [];
  await page.route('**/v1/**', async route => { if (route.request().method() !== 'GET') commands.push(new URL(route.request().url()).pathname); await route.abort('failed'); });
  await page.evaluate(() => (window as unknown as Harness).storyboardTest.configure({ composition: true, videos: true }));
  await page.getByRole('tab', { name: 'Videos', exact: true }).click();
  const card = page.locator('.wp-request-card[data-request-id="request-running"]');
  await card.getByRole('button', { name: 'Cancel request', exact: true }).click();
  await expect(card.getByRole('status')).toHaveText('Request cancellation was not confirmed. The last known state is still shown.');
  await expect(card.locator('.wp-status')).toHaveText('Running');
  await page.evaluate(() => (window as unknown as Harness).storyboardTest.configure({ composition: true, videos: true, accountId: 'other-read-only-account', conversationId: 'other-read-only-conversation' }));
  await page.getByRole('tab', { name: 'Videos', exact: true }).click();
  await expect(page.getByText('Request cancellation was not confirmed. The last known state is still shown.', { exact: true })).toHaveCount(0);
  await page.evaluate(() => (window as unknown as Harness).storyboardTest.unmount());
  expect(commands).toEqual(['/v1/generation-requests/request-running/cancel']);
  expect(await page.evaluate(() => (window as unknown as Harness).storyboardTest.nativeStopCalls())).toBe(0);
});

observedTest('Video Use, list/details and cancellation receive real 401/501 and preserve exact choices/status', async ({ page, materialNetwork }, info) => {
  observedTest.setTimeout(120000);
  await info.attach('prerequisite', { body: 'Read-only workspace/version facts; all application operations other than the labelled workspace projection use the built loopback backend.', contentType: 'text/plain' });
  const { verifyBuiltAdmission } = await import(pathToFileURL(resolve('apps/api/.test-build/test/auth-built-fixture.js')).href) as { verifyBuiltAdmission: typeof VerifyBuiltAdmission };
  const cleanup: (() => void | Promise<void>)[] = [];
  try {
    await verifyBuiltAdmission({ diagnostic(message) { console.log(message); }, after(fn) { cleanup.push(fn); } }, async ({ origin, accessTokens }) => {
      for (const [token, status] of [[accessTokens[0], 501], [null, 401]] as const) {
        await page.goto('/storyboard.html'); await page.waitForFunction(() => !!(window as unknown as Harness).storyboardTest);
        materialNetwork.expectOperations(
          // Candidate resolution and VersionReview each own one exact-version read per row.
          { origin, method: 'GET', path: '/v1/versions/video-v2', count: 2, query: {} },
          { origin, method: 'GET', path: '/v1/conversations/read-only-conversation/generation-requests', count: 1, query: {} },
          { origin, method: 'GET', path: '/v1/generation-requests/request-running', count: 1, query: {} },
          { origin, method: 'POST', path: '/v1/conversations/read-only-conversation/uses', count: 1, query: {}, purpose: 'shot_video' },
          { origin, method: 'POST', path: '/v1/generation-requests/request-running/cancel', count: 1, query: {} },
        );
        const commands: { path: string; body: unknown }[] = [];
        await page.route('**/v1/**', async route => { expect(new URL(route.request().url()).origin).toBe(origin); if (route.request().method() !== 'GET') commands.push({ path: new URL(route.request().url()).pathname, body: route.request().postDataJSON() }); await route.continue(); });
        await page.evaluate(input => (window as unknown as Harness).storyboardTest.configure(input), { composition: true, videos: true, apiOrigin: origin, token });
        await activate(page.getByRole('tab', { name: 'Videos', exact: true }), status === 501);
        await expect(page.getByText(status === 501 ? 'Generation requests are not available yet.' : 'Sign-in required to load generation requests.', { exact: true })).toBeVisible();
        expect(commands).toEqual([]);
        const use = page.waitForResponse(value => value.url() === `${origin}/v1/conversations/read-only-conversation/uses`);
        await activate(page.locator('.wp-video-row').getByRole('button', { name: 'Use this version', exact: true }), status === 501);
        expect((await use).status()).toBe(status);
        await expect(page.getByText(status === 501 ? 'Using this version is not available yet. The current selection is unchanged.' : 'Sign-in required to use this version. The current selection is unchanged.', { exact: true })).toBeVisible();
        expect(await page.locator('.wp-video-row [data-current-version-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-current-version-id')))).toEqual(['video-v1', 'video-v1']);
        const card = page.locator('.wp-request-card[data-request-id="request-running"]');
        const details = page.waitForResponse(value => value.url() === `${origin}/v1/generation-requests/request-running`);
        await activate(card.locator('summary'), status === 501); expect((await details).status()).toBe(status);
        await expect(card.getByText(status === 501 ? 'Request details are not available yet.' : 'Sign-in required to load request details.', { exact: true })).toBeVisible();
        const cancel = page.waitForResponse(value => value.url() === `${origin}/v1/generation-requests/request-running/cancel`);
        await activate(card.getByRole('button', { name: 'Cancel request', exact: true }), status === 501); expect((await cancel).status()).toBe(status);
        await expect(card.getByRole('status')).toHaveText([status === 501 ? 'Request details are not available yet.' : 'Sign-in required to load request details.', status === 501 ? 'Cancelling this request is not available yet. The last known state is still shown.' : 'Sign-in required to cancel this request. The last known state is still shown.']);
        await expect(card.locator('.wp-status')).toHaveText('Running');
        expect(commands).toEqual([{ path: '/v1/conversations/read-only-conversation/uses', body: { purpose: 'shot_video', shotId: 'shot-a', versionId: 'video-v2', operationId: expect.stringMatching(/^[0-9a-f-]{36}$/) } }, { path: '/v1/generation-requests/request-running/cancel', body: { operationId: expect.stringMatching(/^[0-9a-f-]{36}$/) } }]);
        await page.evaluate(() => (window as unknown as Harness).storyboardTest.unmount());
        expect(commands).toHaveLength(2); expect(await page.evaluate(() => (window as unknown as Harness).storyboardTest.nativeStopCalls())).toBe(0);
        await page.unroute('**/v1/**');
      }
    }, { browserOrigin });
  } finally { for (const finish of cleanup.reverse()) await finish(); }
});
