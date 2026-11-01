import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { OperationRequest } from '../../packages/contracts/src/index.js';
import { test, expect, loadSupport, signIn } from './fixtures.js';
import type * as LibraryWork from '../../apps/api/test/support/library-reuse-work.js';

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

test('attaching from the Library retries only the unconfirmed item, and attached items remain after reload', async ({ page, backend }) => {
  const { prepareLibraryReuseWork } = await loadSupport<typeof LibraryWork>('library-reuse-work');
  const accounts = await backend.accounts(2);
  const saved = await prepareLibraryReuseWork(backend.setup(accounts));
  const usePath = `/v1/conversations/${saved.otherConversationId}/uses`;
  await signIn(page, accounts[0]!, `/app?conversation=${saved.otherConversationId}`);

  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.locator(`[data-page-id="${saved.reference.artifactId}"]`).click();
  await page.locator(`[data-page-id="${saved.secondReference.artifactId}"]`).click();
  // The second use commits on the backend, but its response never reaches the browser.
  const commands: OperationRequest<'useVersion'>['body'][] = [];
  await page.route(url => url.pathname === usePath, async route => {
    commands.push(route.request().postDataJSON() as OperationRequest<'useVersion'>['body']);
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    if (commands.length === 2) await route.abort('failed'); else await route.fulfill({ response });
  });
  await page.getByRole('button', { name: 'Attach (2)', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('could not be confirmed');
  await expect(page.locator('.wp-picker-count')).toHaveText('1 selected');

  await page.getByRole('button', { name: 'Retry attach', exact: true }).click();
  await expect(page.locator('.wp-picker-count')).toHaveText('Nothing selected yet');
  expect(commands).toHaveLength(3);
  expect(commands[2]).toEqual(commands[1]);
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  await page.reload();
  await page.getByRole('tab', { name: 'Assets', exact: true }).click();
  await expect(page.locator('.wp-asset-row').filter({ hasText: 'Ada reference' })).toHaveCount(1);
  await expect(page.locator('.wp-asset-row').filter({ hasText: 'Station reference' })).toHaveCount(1);
});

test('a saved Library video plays and seeks, and its download matches the stored bytes', async ({ page, backend }) => {
  const accounts = await backend.accounts(2);
  const saved = await backend.media.prepare(backend.setup(accounts));
  await signIn(page, accounts[0]!, `/app?conversation=${saved.conversationId}`);

  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.locator(`[data-page-id="${saved.video.artifactId}"]`).locator('..').getByRole('button', { name: /^Inspect / }).click();
  const clip = page.locator('.wp-clip-media');
  await expect(page.locator('.wp-clip-surface[data-ready="true"]')).toHaveCount(1);
  expect(await clip.evaluate(node => [(node as HTMLVideoElement).videoWidth, (node as HTMLVideoElement).videoHeight])).toEqual([320, 180]);

  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => clip.evaluate(node => {
    const video = node as HTMLVideoElement & { webkitAudioDecodedByteCount: number };
    return video.getVideoPlaybackQuality().totalVideoFrames > 0 && video.webkitAudioDecodedByteCount > 0;
  }), { timeout: 10_000 }).toBe(true);
  await expect.poll(() => page.locator('.wp-clip-surface').getAttribute('data-player-status')).toBe('ended');
  await page.getByRole('slider', { name: 'Seek' }).fill('500');
  await expect.poll(() => clip.evaluate(node => (node as HTMLVideoElement).currentTime)).toBeCloseTo(0.5, 1);

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download', exact: true }).click()]);
  expect(download.suggestedFilename()).toBe('version-1.mp4');
  expect(sha256(await readFile(await download.path()))).toBe(sha256(backend.media.videoBytes));
});
