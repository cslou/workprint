import { browserOrigin } from '../origin.js';
import { expect, test } from '@playwright/test';
import { test as observedTest } from '../material-network.js';
import { activate } from '../activation.js';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import type { verifyBuiltAdmission as VerifyBuiltAdmission } from '../../../apps/api/test/auth-built-fixture.js';
import type { OperationResponse } from '../../../packages/contracts/src/index.js';

type Harness = { mediaTest: { configure(input: unknown): void; source(id: string, input?: Record<string, unknown>): OperationResponse<'media'>; release(index: number, result: unknown): void; pending(): string[]; requested(): string[]; commands(): string[]; switchScope(account: string): void; unmount(): void } };

observedTest('exact-version media denies nonexistent 404 and unauthenticated 401 without loading or selecting', async ({ page, materialNetwork }, info) => {
  observedTest.setTimeout(120000);
  await info.attach('prerequisite', { body: 'Read-only public workspace and version projections; the viewer media read and all other application requests use the built loopback backend.', contentType: 'text/plain' });
  const { verifyBuiltAdmission } = await import(pathToFileURL(resolve('apps/api/.test-build/test/auth-built-fixture.js')).href) as { verifyBuiltAdmission: typeof VerifyBuiltAdmission };
  const cleanup: (() => void | Promise<void>)[] = [];
  try {
    await verifyBuiltAdmission({ diagnostic(message) { console.log(message); }, after(fn) { cleanup.push(fn); } }, async ({ origin, accessTokens }) => {
      for (const [token, status, copy] of [[accessTokens[0], 404, 'This video could not be loaded. Nothing was changed.'], [null, 401, 'Sign-in required to load this video.']] as const) {
        await page.goto('/media.html');
        await page.waitForFunction(() => !!(window as unknown as { mediaTest?: unknown }).mediaTest);
        materialNetwork.expectOperations(
          // Candidate resolution and VersionReview each own one exact-version read per row.
          { origin, method: 'GET', path: '/v1/versions/video-v2', count: 2, query: {} },
          { origin, method: 'GET', path: '/v1/versions/video-v1', count: 2, query: {} },
          { origin, method: 'GET', path: '/v1/conversations/read-only-conversation/generation-requests', count: 1, query: {} },
          { origin, method: 'GET', path: '/v1/versions/video-v2/media', count: 1, query: {} },
        );
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
        await activate(page.getByRole('button', { name: 'View Shot 1 version 2', exact: true }), status === 404);
        const result = await response;
        expect(result.status()).toBe(status);
        expect(await result.json()).toMatchObject({ error: { code: status === 404 ? 'not_found' : 'unauthenticated' } });
        await expect(page.locator('.wp-clip-note')).toHaveText(copy);
        await expect(page.locator('.wp-clip-surface')).toHaveCount(1);
        await expect(page.locator('.wp-clip-media')).toHaveCount(0);
        await expect(page.locator('.wp-clip-time')).toHaveCount(0);
        expect(requests.filter((request) => request.method !== 'GET')).toEqual([]);
        expect(requests.filter((request) => request.path === '/v1/versions/video-v2/media')).toEqual([{ method: 'GET', path: '/v1/versions/video-v2/media' }]);
        await activate(page.getByRole('button', { name: 'Close', exact: true }), status === 404);
        await expect(page.locator('.wp-clip-surface')).toHaveCount(0);
        const after = await page.locator('.wp-video-row').evaluateAll((nodes) => nodes.map((node) => node.querySelector('[data-current-version-id]')?.getAttribute('data-current-version-id') ?? null));
        expect(after).toEqual(before);
        expect(requests.filter((request) => request.method !== 'GET')).toEqual([]);
        await page.evaluate(() => (window as unknown as Harness).mediaTest.unmount());
        await page.unrouteAll({ behavior: 'wait' });
      }
    }, { browserOrigin });
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

observedTest('a generated local clip proves supplied-source play, pause, seek and teardown', async ({ page }, info) => {
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
  await page.getByRole('button', { name: 'Play', exact: true }).press('Enter');
  await expect.poll(() => page.locator('.wp-clip-surface').getAttribute('data-player-status')).toBe('playing');
  await expect.poll(() => page.evaluate(() => document.querySelector('video')?.currentTime ?? 0)).toBeGreaterThan(0.1);
  await page.getByRole('button', { name: 'Pause', exact: true }).press('Space');
  await expect.poll(() => page.evaluate(() => document.querySelector('video')?.paused)).toBe(true);
  await expect(page.locator('.wp-clip-surface')).toHaveAttribute('data-player-status', 'paused');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('.wp-clip-surface')).toHaveAttribute('data-player-status', 'playing');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.querySelector('video')?.paused)).toBe(true);
  await expect(page.locator('.wp-clip-surface')).toHaveAttribute('data-player-status', 'paused');
  const seek = page.locator('.wp-clip-seek');
  const bounds = await seek.boundingBox();
  if (!bounds) throw new Error('Missing seek control');
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await expect.poll(() => page.evaluate(() => document.querySelector('video')?.currentTime ?? 0)).toBeGreaterThan(0.9);
  await expect(page.locator('.wp-clip-time')).toHaveText('0:01 / 0:02');
  await seek.press('Home');
  await expect.poll(() => page.evaluate(() => document.querySelector('video')?.currentTime)).toBe(0);
  await seek.press('ArrowRight');
  await expect.poll(() => page.evaluate(() => document.querySelector('video')?.currentTime ?? 0)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('video')).toHaveCount(0);
  await expect(page.locator('.wp-clip-surface')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as Harness).mediaTest.commands())).toEqual([]);
});

type MediaHarness = { mediaTest: { configure(input: unknown): void; source(id: string, input?: Record<string, unknown>): OperationResponse<'media'>; release(index: number, result: unknown): void; pending(): string[]; requested(): string[]; commands(): string[]; switchScope(account: string, conversation?: string): void; unmount(): void; loadCalls(): number } };
const openClip = async (page: import('@playwright/test').Page) => {
  await page.goto('/media.html');
  await page.waitForFunction(() => !!(window as unknown as { mediaTest?: unknown }).mediaTest);
  await page.evaluate(() => (window as unknown as MediaHarness).mediaTest.configure({ controlled: true }));
  await page.getByRole('button', { name: 'View Shot 1 version 2', exact: true }).click();
};
const releaseClip = (page: import('@playwright/test').Page, index: number, input?: Record<string, unknown>) => page.evaluate(({ index, input }) => {
  const harness = (window as unknown as MediaHarness).mediaTest;
  harness.release(index, { ok: true, value: harness.source('video-v2', input) });
}, { index, input });

test('loading feedback exactly fills the 16:9 surface', async ({ page }) => {
  await openClip(page);
  const boxes = await page.evaluate(() => {
    const surface = document.querySelector('.wp-clip-surface')?.getBoundingClientRect();
    const note = document.querySelector('.wp-clip-note')?.getBoundingClientRect();
    return { surface: surface?.toJSON() ?? null, note: note?.toJSON() ?? null };
  });
  expect(boxes.surface).not.toBeNull(); expect(boxes.note).not.toBeNull();
  expect(boxes.note!.x).toBeCloseTo(boxes.surface!.x, 1);
  expect(boxes.note!.y).toBeCloseTo(boxes.surface!.y, 1);
  expect(boxes.note!.width).toBeCloseTo(boxes.surface!.width, 1);
  expect(boxes.note!.height).toBeCloseTo(boxes.surface!.height, 1);
  expect(boxes.surface!.width / boxes.surface!.height).toBeCloseTo(16 / 9, 2);
});

test('an expired source reacquires once and then stops without more requests', async ({ page }) => {
  await openClip(page);
  await releaseClip(page, 0, { expiresAt: new Date(Date.now() - 1000).toISOString() });
  await expect.poll(() => page.evaluate(() => (window as unknown as MediaHarness).mediaTest.requested())).toEqual(['video-v2', 'video-v2']);
  await releaseClip(page, 1, { expiresAt: new Date(Date.now() - 1000).toISOString() });
  await expect(page.locator('.wp-clip-note')).toHaveText('This video could not be loaded. Nothing was changed.');
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => (window as unknown as MediaHarness).mediaTest.requested())).toEqual(['video-v2', 'video-v2']);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as unknown as MediaHarness).mediaTest.requested())).toEqual(['video-v2', 'video-v2']);
});

test('closing and switching versions during playback releases the retained element', async ({ page }) => {
  await openClip(page);
  await releaseClip(page, 0);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => page.locator('.wp-clip-surface').getAttribute('data-player-status')).toBe('playing');
  await page.evaluate(() => { (window as unknown as { oldVideo: HTMLVideoElement }).oldVideo = document.querySelector('video')!; });
  const loads = await page.evaluate(() => (window as unknown as MediaHarness).mediaTest.loadCalls());
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as MediaHarness).mediaTest.loadCalls())).toBeGreaterThan(loads);
  const released = await page.evaluate(() => { const video = (window as unknown as { oldVideo: HTMLVideoElement }).oldVideo; return { paused: video.paused, src: video.getAttribute('src') }; });
  expect(released).toEqual({ paused: true, src: null });
  await page.evaluate(() => { const video = (window as unknown as { oldVideo: HTMLVideoElement }).oldVideo; video.dispatchEvent(new Event('timeupdate')); video.dispatchEvent(new Event('play')); });
  await page.getByRole('button', { name: 'View Shot 1 version 1', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as MediaHarness).mediaTest.pending())).toEqual(['video-v2', 'video-v1']);
  const before = await page.evaluate(() => (window as unknown as MediaHarness).mediaTest.requested());
  await page.evaluate(() => (window as unknown as MediaHarness).mediaTest.unmount());
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => (window as unknown as MediaHarness).mediaTest.requested())).toEqual(before);
});

for (const change of ['account', 'conversation'] as const) for (const order of ['old-first', 'old-last'] as const) test(`pending ${change} change releases the ${order} source`, async ({ page }) => {
  await openClip(page);
  await expect.poll(() => page.evaluate(() => (window as unknown as MediaHarness).mediaTest.pending())).toEqual(['video-v2']);
  await page.evaluate((selected) => {
    const test = (window as unknown as MediaHarness).mediaTest;
    if (selected === 'account') test.switchScope('other-account', 'read-only-conversation');
    else test.switchScope('read-only-account', 'other-conversation');
  }, change);
  await page.getByRole('button', { name: 'View Shot 1 version 2', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as MediaHarness).mediaTest.pending())).toEqual(['video-v2', 'video-v2']);
  if (order === 'old-first') {
    await releaseClip(page, 0, { url: '/fixtures/clip.webm?old' });
    await expect(page.locator('video')).toHaveCount(0);
    await releaseClip(page, 1, { url: '/fixtures/clip.webm?new' });
  } else {
    await releaseClip(page, 1, { url: '/fixtures/clip.webm?new' });
    await expect(page.locator('.wp-clip-surface[data-ready="true"]')).toHaveCount(1);
    await releaseClip(page, 0, { url: '/fixtures/clip.webm?old' });
  }
  await expect(page.locator('video')).toHaveAttribute('src', '/fixtures/clip.webm?new');
  await expect(page.locator('video')).not.toHaveAttribute('src', /old/);
});

test('unmounting while media is pending creates no player or request', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await openClip(page);
  await expect.poll(() => page.evaluate(() => (window as unknown as MediaHarness).mediaTest.pending())).toEqual(['video-v2']);
  const before = await page.evaluate(() => ({ requested: (window as unknown as MediaHarness).mediaTest.requested(), loads: (window as unknown as MediaHarness).mediaTest.loadCalls() }));
  await page.evaluate(() => (window as unknown as MediaHarness).mediaTest.unmount());
  await page.evaluate(() => { const test = (window as unknown as MediaHarness).mediaTest; test.release(0, { ok: true, value: test.source('video-v2') }); });
  await page.waitForTimeout(400);
  expect(await page.locator('.wp-clip-surface, video').count()).toBe(0);
  expect(await page.evaluate(() => (window as unknown as MediaHarness).mediaTest.requested())).toEqual(before.requested);
  expect(await page.evaluate(() => (window as unknown as MediaHarness).mediaTest.loadCalls())).toBe(before.loads);
  expect(errors).toEqual([]);
});

test('a successful reacquire replaces the source and a failed playing reacquire stops playback', async ({ page }) => {
  await openClip(page);
  await releaseClip(page, 0, { url: '/fixtures/clip.webm?first', expiresAt: new Date(Date.now() + 800).toISOString() });
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as MediaHarness).mediaTest.requested())).toEqual(['video-v2', 'video-v2']);
  await releaseClip(page, 1, { url: '/fixtures/clip.webm?second', expiresAt: new Date(Date.now() + 1200).toISOString() });
  await expect.poll(() => page.evaluate(() => document.querySelector('video')?.getAttribute('src'))).toContain('?second');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => page.locator('.wp-clip-surface').getAttribute('data-player-status')).toBe('playing');
  await page.evaluate(() => { (window as unknown as { oldVideo: HTMLVideoElement }).oldVideo = document.querySelector('video')!; });
  await expect.poll(() => page.evaluate(() => (window as unknown as MediaHarness).mediaTest.requested()), { timeout: 5000 }).toEqual(['video-v2', 'video-v2', 'video-v2']);
  await page.evaluate(() => (window as unknown as MediaHarness).mediaTest.release(2, { ok: false, error: { code: 'not_implemented', message: 'Read unavailable' } }));
  await expect(page.locator('.wp-clip-note')).toHaveText('Loading this video is not available yet.');
  await expect(page.locator('.wp-clip-time')).toHaveCount(0);
  const released = await page.evaluate(() => { const video = (window as unknown as { oldVideo: HTMLVideoElement }).oldVideo; return { paused: video.paused, src: video.getAttribute('src') }; });
  expect(released).toEqual({ paused: true, src: null });
});

test('a corrupt local source exercises the native error path and cleans up', async ({ page }) => {
  await openClip(page);
  await releaseClip(page, 0, { url: '/fixtures/corrupt.webm' });
  await expect(page.locator('.wp-clip-note')).toHaveText('This video could not be loaded. Nothing was changed.');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toHaveCount(0);
  await expect(page.locator('.wp-clip-time')).toHaveCount(0);
  const released = await page.evaluate(() => { const video = document.querySelector('video'); return video ? { paused: video.paused, src: video.getAttribute('src') } : null; });
  expect(released).toEqual({ paused: true, src: null });
});
