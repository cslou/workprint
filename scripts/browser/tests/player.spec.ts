import { expect, test } from '@playwright/test';

type Harness = { playerTest: { setSource(value: unknown): void; play(): void; seek(value: number): void; dispose(): void; snapshot(): { status: string; durationMs: number | null; positionMs: number }; events(): number; deferPlay(): void; rejectPlay(name: string): void; resolvePlay(): void; resetPlay(): void; dispatch(type: string): void; src(): string | null; paused(): boolean; loadCalls(): number; readyState(): number; pause(): void; statuses(): string[]; rejections(): string[]; listeners(): { added: number; removed: number; remaining: number } } };
const source = (sourceId: string, url = '/fixtures/clip.webm') => ({ sourceId, url, posterUrl: '/fixtures/clip-poster.png' });
const ready = async (page: import('@playwright/test').Page) => expect.poll(() => page.evaluate(() => (window as unknown as Harness).playerTest.snapshot().status)).toBe('ready');

test('rejections and failed state are truthful, sticky and stale-safe', async ({ page }) => {
  await page.goto('/player.html');
  await page.waitForFunction(() => !!(window as unknown as { playerTest?: unknown }).playerTest);
  const harness = () => page.evaluate(() => (window as unknown as Harness).playerTest.snapshot());
  await page.evaluate((value) => (window as unknown as Harness).playerTest.setSource(value), source('first'));
  await ready(page);
  await page.evaluate(() => { const test = (window as unknown as Harness).playerTest; test.deferPlay(); test.play(); test.rejectPlay('NotAllowedError'); });
  await expect.poll(async () => (await harness()).status).toBe('paused');
  await page.evaluate((value) => (window as unknown as Harness).playerTest.setSource(value), source('second'));
  await ready(page);
  await page.evaluate(() => { const test = (window as unknown as Harness).playerTest; test.deferPlay(); test.play(); test.rejectPlay('NotSupportedError'); });
  await expect.poll(async () => (await harness()).status).toBe('failed');
  await page.evaluate(() => { const test = (window as unknown as Harness).playerTest; test.dispatch('play'); test.dispatch('canplay'); test.dispatch('timeupdate'); });
  expect((await harness()).status).toBe('failed');
  await page.evaluate((value) => (window as unknown as Harness).playerTest.setSource(value), source('third'));
  await expect.poll(async () => (await harness()).status).not.toBe('failed');
  await ready(page);
  await page.evaluate(() => { const test = (window as unknown as Harness).playerTest; test.deferPlay(); test.play(); });
  await page.evaluate((value) => (window as unknown as Harness).playerTest.setSource(value), source('fourth'));
  await ready(page);
  await page.evaluate(() => (window as unknown as Harness).playerTest.rejectPlay('NotSupportedError'));
  await expect.poll(async () => (await harness()).status).toBe('ready');
});

test('native play then pause before ready rejects with AbortError and stays usable', async ({ page }) => {
  await page.goto('/player.html');
  await page.waitForFunction(() => !!(window as unknown as { playerTest?: unknown }).playerTest);
  await page.evaluate((value) => { const test = (window as unknown as Harness).playerTest; test.setSource(value); test.play(); test.pause(); }, source('native-early'));
  await expect.poll(() => page.evaluate(() => (window as unknown as Harness).playerTest.rejections()), { timeout: 5000 }).toContain('AbortError');
  await expect.poll(() => page.evaluate(() => (window as unknown as Harness).playerTest.snapshot().status)).not.toBe('failed');
  expect(await page.evaluate(() => (window as unknown as Harness).playerTest.statuses())).not.toContain('failed');
  await ready(page);
  await page.evaluate(() => (window as unknown as Harness).playerTest.play());
  await expect.poll(() => page.evaluate(() => (window as unknown as Harness).playerTest.snapshot().status)).toBe('playing');
  expect(await page.evaluate(() => (window as unknown as Harness).playerTest.statuses())).not.toContain('failed');
  await page.evaluate(() => (window as unknown as Harness).playerTest.pause());
});

test('native play then pause after ready leaves the element paused', async ({ page }) => {
  await page.goto('/player.html');
  await page.waitForFunction(() => !!(window as unknown as { playerTest?: unknown }).playerTest);
  await page.evaluate((value) => (window as unknown as Harness).playerTest.setSource(value), source('native-ready'));
  await ready(page);
  await page.evaluate(() => { const test = (window as unknown as Harness).playerTest; test.play(); test.pause(); });
  await expect.poll(() => page.evaluate(() => (window as unknown as Harness).playerTest.snapshot().status)).toBe('paused');
  expect(await page.evaluate(() => (window as unknown as Harness).playerTest.statuses())).not.toContain('failed');
  await page.evaluate(() => (window as unknown as Harness).playerTest.play());
  await expect.poll(() => page.evaluate(() => (window as unknown as Harness).playerTest.snapshot().status)).toBe('playing');
  await page.evaluate(() => (window as unknown as Harness).playerTest.pause());
});

test('an AbortError on the current attempt does not fail', async ({ page }) => {
  await page.goto('/player.html');
  await page.waitForFunction(() => !!(window as unknown as { playerTest?: unknown }).playerTest);
  await page.evaluate((value) => (window as unknown as Harness).playerTest.setSource(value), source('current-abort'));
  await ready(page);
  await page.evaluate(() => { const test = (window as unknown as Harness).playerTest; test.deferPlay(); test.play(); test.rejectPlay('AbortError'); });
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => (window as unknown as Harness).playerTest.snapshot().status)).not.toBe('failed');
  expect(await page.evaluate(() => (window as unknown as Harness).playerTest.snapshot().status)).toBe('ready');
});

test('supplied duration is normalized and seeking after ended derives status', async ({ page }) => {
  await page.goto('/player.html');
  await page.waitForFunction(() => !!(window as unknown as { playerTest?: unknown }).playerTest);
  await page.evaluate(() => (window as unknown as Harness).playerTest.setSource({ sourceId: 'invalid-duration', url: '/fixtures/missing.webm', durationMs: -5 }));
  expect(await page.evaluate(() => (window as unknown as Harness).playerTest.snapshot().durationMs)).toBe(null);
  await page.evaluate((value) => (window as unknown as Harness).playerTest.setSource(value), source('ended'));
  await ready(page);
  await page.evaluate(() => (window as unknown as Harness).playerTest.dispatch('ended'));
  expect(await page.evaluate(() => (window as unknown as Harness).playerTest.snapshot().status)).toBe('ended');
  await page.evaluate(() => (window as unknown as Harness).playerTest.seek(500));
  await expect.poll(() => page.evaluate(() => (window as unknown as Harness).playerTest.snapshot().status)).not.toBe('ended');
});

test('dispose clears the resource and removes listeners', async ({ page }) => {
  await page.goto('/player.html');
  await page.waitForFunction(() => !!(window as unknown as { playerTest?: unknown }).playerTest);
  await page.evaluate((value) => (window as unknown as Harness).playerTest.setSource(value), source('dispose'));
  await ready(page);
  await page.evaluate(() => (window as unknown as Harness).playerTest.play());
  await expect.poll(() => page.evaluate(() => (window as unknown as Harness).playerTest.snapshot().status)).toBe('playing');
  const before = await page.evaluate(() => ({ events: (window as unknown as Harness).playerTest.events(), loads: (window as unknown as Harness).playerTest.loadCalls() }));
  await page.evaluate(() => (window as unknown as Harness).playerTest.dispose());
  expect(await page.evaluate(() => (window as unknown as Harness).playerTest.src())).toBe(null);
  expect(await page.evaluate(() => (window as unknown as Harness).playerTest.paused())).toBe(true);
  expect(await page.evaluate(() => (window as unknown as Harness).playerTest.loadCalls())).toBeGreaterThan(before.loads);
  const after = await page.evaluate(() => (window as unknown as Harness).playerTest.events());
  await page.evaluate(() => { const test = (window as unknown as Harness).playerTest; test.dispatch('timeupdate'); test.dispatch('play'); test.dispatch('ended'); });
  expect(await page.evaluate(() => (window as unknown as Harness).playerTest.events())).toBe(after);
  const listeners = await page.evaluate(() => (window as unknown as Harness).playerTest.listeners());
  expect(listeners.added).toBeGreaterThan(0);
  expect(listeners.removed).toBeGreaterThanOrEqual(listeners.added);
  expect(listeners.remaining).toBe(0);
});
