import { expect, test } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import type { verifyBuiltAdmission as VerifyBuiltAdmission } from '../../../apps/api/test/auth-built-fixture.js';
import type { OperationResponse } from '../../../packages/contracts/src/index.js';

type Harness = { mediaTest: { configure(input: unknown): void; source(id: string, input?: Record<string, unknown>): OperationResponse<'media'>; release(index: number, result: unknown): void; pending(): string[]; requested(): string[]; commands(): string[]; switchScope(account: string): void; unmount(): void } };

test('exact-version media reaches the built backend and renders 501/401 without loading or selecting', async ({ page }, info) => {
  test.setTimeout(120000);
  await info.attach('prerequisite', { body: 'Read-only public workspace and version projections; the viewer media read and all other application requests use the built loopback backend.', contentType: 'text/plain' });
  const { verifyBuiltAdmission } = await import(pathToFileURL(resolve('apps/api/.test-build/test/auth-built-fixture.js')).href) as { verifyBuiltAdmission: typeof VerifyBuiltAdmission };
  const cleanup: (() => void | Promise<void>)[] = [];
  try {
    await verifyBuiltAdmission({ diagnostic(message) { console.log(message); }, after(fn) { cleanup.push(fn); } }, async ({ origin, accessTokens }) => {
      for (const [token, status, copy] of [[accessTokens[0], 501, 'Loading this video is not available yet.'], [null, 401, 'Sign-in required to load this video.']] as const) {
        await page.goto('/media.html');
        await page.waitForFunction(() => !!(window as unknown as { mediaTest?: unknown }).mediaTest);
        const requests: { method: string; path: string }[] = [];
        await page.route('**/v1/**', async (route) => {
          const url = new URL(route.request().url());
          expect(url.origin).toBe(origin);
          requests.push({ method: route.request().method(), path: url.pathname });
          await route.continue();
        });
        await page.evaluate((input) => (window as unknown as Harness).mediaTest.configure(input), { apiOrigin: origin, token });
        const before = await page.locator('.wp-video-row').evaluateAll((nodes) => nodes.map((node) => node.querySelector('[data-current-version-id]')?.getAttribute('data-current-version-id') ?? null));
        const response = page.waitForResponse((value) => value.url() === `${origin}/v1/versions/video-v2/media`);
        await page.getByRole('button', { name: 'View Shot 1 version 2', exact: true }).click();
        expect((await response).status()).toBe(status);
        await expect(page.locator('.wp-clip-note')).toHaveText(copy);
        await expect(page.locator('.wp-clip-surface')).toHaveCount(1);
        await expect(page.locator('.wp-clip-media')).toHaveCount(0);
        await expect(page.locator('.wp-clip-time')).toHaveCount(0);
        expect(requests.filter((request) => request.method !== 'GET')).toEqual([]);
        expect(requests.filter((request) => request.path === '/v1/versions/video-v2/media')).toEqual([{ method: 'GET', path: '/v1/versions/video-v2/media' }]);
        await page.getByRole('button', { name: 'Close', exact: true }).click();
        await expect(page.locator('.wp-clip-surface')).toHaveCount(0);
        const after = await page.locator('.wp-video-row').evaluateAll((nodes) => nodes.map((node) => node.querySelector('[data-current-version-id]')?.getAttribute('data-current-version-id') ?? null));
        expect(after).toEqual(before);
        expect(requests.filter((request) => request.method !== 'GET')).toEqual([]);
        await page.evaluate(() => (window as unknown as Harness).mediaTest.unmount());
        await page.unrouteAll({ behavior: 'wait' });
      }
    }, { browserOrigin: 'http://127.0.0.1:4179' });
  } finally { for (const finish of cleanup.reverse()) await finish(); }
});

test('a delayed media source cannot populate a closed or re-opened viewer', async ({ page }) => {
  await page.goto('/media.html');
  await page.waitForFunction(() => !!(window as unknown as { mediaTest?: unknown }).mediaTest);
  await page.evaluate(() => (window as unknown as Harness).mediaTest.configure({ controlled: true }));
  await page.getByRole('button', { name: 'View Shot 1 version 2', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as Harness).mediaTest.pending())).toEqual(['video-v2']);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'View Shot 1 version 1', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as Harness).mediaTest.pending())).toEqual(['video-v2', 'video-v1']);
  await page.evaluate(() => {
    const harness = (window as unknown as Harness).mediaTest;
    harness.release(0, { ok: true, value: harness.source('video-v2') });
  });
  await expect(page.locator('.wp-clip-media')).toHaveCount(0);
  await expect(page.locator('.wp-clip-time')).toHaveCount(0);
  await page.evaluate(() => {
    const harness = (window as unknown as Harness).mediaTest;
    harness.release(1, { ok: true, value: harness.source('video-v1') });
  });
  await expect(page.locator('.wp-clip-surface[data-ready="true"]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await page.evaluate(() => (window as unknown as Harness).mediaTest.switchScope('other-read-only-account'));
  await expect(page.locator('.wp-clip-media')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as Harness).mediaTest.commands())).toEqual([]);
});

test('reacquire stays on the exact version, and a failed reacquire stops playback', async ({ page }) => {
  await page.goto('/media.html');
  await page.waitForFunction(() => !!(window as unknown as { mediaTest?: unknown }).mediaTest);
  await page.evaluate(() => (window as unknown as Harness).mediaTest.configure({ controlled: true }));
  await page.getByRole('button', { name: 'View Shot 1 version 2', exact: true }).click();
  await page.evaluate(() => {
    const harness = (window as unknown as Harness).mediaTest;
    harness.release(0, { ok: true, value: harness.source('video-v2', { expiresAt: new Date(Date.now() + 1200).toISOString() }) });
  });
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as Harness).mediaTest.requested()), { timeout: 5000 }).toEqual(['video-v2', 'video-v2']);
  await expect(page.locator('.wp-clip-media')).toHaveCount(0);
  await page.evaluate(() => {
    const harness = (window as unknown as Harness).mediaTest;
    harness.release(1, { ok: false, error: { code: 'not_implemented', message: 'Read unavailable' } });
  });
  await expect(page.locator('.wp-clip-note')).toHaveText('Loading this video is not available yet.');
  await expect(page.locator('.wp-clip-media')).toHaveCount(0);
  await expect(page.locator('.wp-clip-time')).toHaveCount(0);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'View Shot 1 version 2', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as Harness).mediaTest.requested())).toEqual(['video-v2', 'video-v2', 'video-v2']);
  expect(await page.evaluate(() => (window as unknown as Harness).mediaTest.commands())).toEqual([]);
});

test('a generated local clip proves supplied-source play, pause, seek and teardown', async ({ page }, info) => {
  await info.attach('prerequisite', { body: 'Generated VP8 WebM fixture from apps/web/test/fixtures; camera/version facts are separate read-only projections. No private media or codec-universality claim.', contentType: 'text/plain' });
  await page.goto('/media.html');
  await page.waitForFunction(() => !!(window as unknown as { mediaTest?: unknown }).mediaTest);
  await page.evaluate(() => (window as unknown as Harness).mediaTest.configure({ controlled: true }));
  await page.getByRole('button', { name: 'View Shot 1 version 2', exact: true }).click();
  await page.evaluate(() => {
    const harness = (window as unknown as Harness).mediaTest;
    harness.release(0, { ok: true, value: harness.source('video-v2') });
  });
  await expect(page.locator('.wp-clip-surface[data-ready="true"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => page.locator('.wp-clip-surface').getAttribute('data-player-status')).toBe('playing');
  await expect.poll(() => page.evaluate(() => document.querySelector('video')?.currentTime ?? 0)).toBeGreaterThan(0.1);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.querySelector('video')?.paused)).toBe(true);
  const seek = page.locator('.wp-clip-seek');
  const bounds = await seek.boundingBox();
  if (!bounds) throw new Error('Missing seek control');
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await expect.poll(() => page.evaluate(() => document.querySelector('video')?.currentTime ?? 0)).toBeGreaterThan(0.9);
  await expect(page.locator('.wp-clip-time')).toHaveText('0:01 / 0:02');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('video')).toHaveCount(0);
  await expect(page.locator('.wp-clip-surface')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as Harness).mediaTest.commands())).toEqual([]);
});
