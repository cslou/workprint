import { expect, test, type Page } from '@playwright/test';
import type { OperationResponse } from '../../../packages/contracts/src/index.js';

type Harness = { mediaTest: { configure(input: unknown): void; source(id: string, input?: Record<string, unknown>): OperationResponse<'media'>; release(index: number, result: unknown): void; pending(): string[]; requested(): string[]; commands(): string[]; switchScope(account: string): void } };
type Method = 'configure' | 'pending' | 'requested' | 'commands' | 'switchScope';
const call = (page: Page, method: Method, ...args: unknown[]) => page.evaluate(([method, args]) => ((window as unknown as Harness).mediaTest[method] as (...input: unknown[]) => unknown)(...args), [method, args] as const);
const release = (page: Page, index: number, url: string) => page.evaluate(([index, url]) => { const value = (window as unknown as Harness).mediaTest; value.release(index, { ok: true, value: value.source('video-v2', { url, expiresAt: new Date(Date.now() + 60_000).toISOString() }) }); }, [index, url] as const);
const open = async (page: Page) => {
  await page.clock.install();
  await page.goto('/media.html');
  await page.waitForFunction(() => !!(window as unknown as { mediaTest?: unknown }).mediaTest);
  await call(page, 'configure', { controlled: true });
  await page.getByRole('button', { name: 'View Shot 1 version 2', exact: true }).click();
  await expect.poll(() => call(page, 'pending')).toEqual(['video-v2']);
};
const media = (page: Page) => page.locator('.wp-clip-media');
const status = (page: Page) => page.locator('.wp-clip-surface').getAttribute('data-player-status');
const time = (page: Page) => media(page).evaluate(node => (node as HTMLVideoElement).currentTime);

test('reacquired access keeps one player and carries the exact clip position and playback', async ({ page }) => {
  await open(page);
  await release(page, 0, '/fixtures/clip.webm?access=1');
  await expect(page.locator('.wp-clip-surface[data-ready="true"]')).toHaveCount(1);
  // Slow playback so the 2s synthetic clip outlasts each refresh; the same element must survive every refresh.
  await media(page).evaluate(node => { const element = node as HTMLVideoElement & { refreshMarker?: boolean }; element.refreshMarker = true; element.defaultPlaybackRate = 0.1; element.playbackRate = 0.1; });
  await page.getByRole('slider', { name: 'Seek' }).fill('1200');
  await expect.poll(() => time(page)).toBeCloseTo(1.2, 1);

  // Access refreshes before its 60s expiry; the held source keeps playing while the refresh is pending.
  await page.clock.fastForward(51_000);
  await expect.poll(() => call(page, 'pending')).toEqual(['video-v2', 'video-v2']);
  await expect(page.locator('.wp-clip-surface[data-ready="true"]')).toHaveCount(1);
  await expect(media(page)).toHaveAttribute('src', '/fixtures/clip.webm?access=1');
  await release(page, 1, '/fixtures/clip.webm?access=2');
  await expect(media(page)).toHaveAttribute('src', '/fixtures/clip.webm?access=2');
  await expect.poll(() => status(page)).toBe('ready');
  await expect.poll(() => time(page)).toBeCloseTo(1.2, 1);

  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => status(page)).toBe('playing');
  await expect.poll(() => time(page)).toBeGreaterThan(1.25);
  const before = await time(page);
  await page.clock.fastForward(51_000);
  await expect.poll(() => call(page, 'pending')).toHaveLength(3);
  await release(page, 2, '/fixtures/clip.webm?access=3');
  await expect(media(page)).toHaveAttribute('src', '/fixtures/clip.webm?access=3');
  await expect.poll(() => status(page)).toBe('playing');
  await expect.poll(() => time(page)).toBeGreaterThan(before);
  expect(await media(page).evaluate(node => (node as HTMLVideoElement & { refreshMarker?: boolean }).refreshMarker)).toBe(true);

  // A failed refresh is terminal: the clip is torn down and no further access is requested.
  await page.clock.fastForward(51_000);
  await expect.poll(() => call(page, 'pending')).toHaveLength(4);
  await page.evaluate(() => (window as unknown as Harness).mediaTest.release(3, { ok: false, error: { code: 'not_found', message: 'Missing' } }));
  await expect(media(page)).toHaveCount(0);
  await expect(page.locator('.wp-clip-note')).toHaveText('This video could not be loaded. Nothing was changed.');
  await page.clock.fastForward(180_000);
  expect(await call(page, 'requested')).toEqual(['video-v2', 'video-v2', 'video-v2', 'video-v2']);
  expect(await call(page, 'commands')).toEqual([]);
});

test('download refuses bytes that do not match the exact version and scope changes tear the clip down', async ({ page }) => {
  await open(page);
  await release(page, 0, '/fixtures/clip.webm');
  await expect(page.locator('.wp-clip-surface[data-ready="true"]')).toHaveCount(1);
  let downloads = 0;
  page.on('download', () => { downloads += 1; });
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await expect(page.getByText('This video could not be downloaded. Nothing was changed.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeEnabled();
  expect(downloads).toBe(0);

  await call(page, 'switchScope', 'other-account');
  await expect(media(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Download', exact: true })).toHaveCount(0);
  expect(await call(page, 'commands')).toEqual([]);
});
