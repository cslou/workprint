import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, expect } from '../material-network.js';
import { browserOrigin } from '../origin.js';
import { startReadBackend } from '../qualified-saved-backend.js';
import type { createLibraryMediaFixture as Fixture } from '../../../apps/api/test/library-media-work.js';
import type { OperationRequest, OperationResponse } from '../../../packages/contracts/src/index.js';
import type { query as Query } from '../../../apps/api/test/postgres.js';

test.use({ trace: 'off', video: 'off' });
test('real private image inspection and saved-video playback/download grant no approval; reference edits retain exact images through conflict and lost response', async ({ page, materialNetwork }) => {
  test.setTimeout(300000);
  const { createLibraryMediaFixture } = await import(pathToFileURL(resolve('apps/api/.test-build/test/library-media-work.js')).href) as { createLibraryMediaFixture: typeof Fixture };
  const { query } = await import(pathToFileURL(resolve('apps/api/.test-build/test/postgres.js')).href) as { query: typeof Query };
  const media = await createLibraryMediaFixture(browserOrigin);
  let savedReferenceId = '';
  try {
    const backend = await startReadBackend(media.prepare, async url => {
      const rows = (await query(url, "SELECT v.version_id,v.content,ARRAY(SELECT dependency_id FROM artifacts.version_dependencies d WHERE d.version_id=v.version_id ORDER BY position) AS dependencies FROM artifacts.versions v WHERE kind='reference' AND revision=3")).rows.filter(row => row.version_id === savedReferenceId);
      assert.equal(rows.length, 1); assert.equal(rows[0]?.content.subject.description, 'Keep my reference description and exact image.'); assert.equal(rows[0]?.dependencies.length, 1);
      assert.deepEqual((await query(url, "SELECT (SELECT count(*)::int FROM artifacts.media_objects) AS objects,(SELECT count(*)::int FROM artifacts.commands WHERE command_kind='use_version') AS uses,(SELECT count(*)::int FROM artifacts.manual_changes) AS changes")).rows, [{ objects: 2, uses: 0, changes: 2 }], 'Inspection grants no approval; reference edits add versions, never object copies or Shot choices');
    }, { storage: media.configuration, media: media.media });
    try {
      const { target, saved } = backend.data;
      const allow = (method: string, path: string, query: Record<string, string> = {}, count = 1) => materialNetwork.expectOperations({ origin: target.origin, method, path, query, count });
      const configure = async () => {
        allow('GET', `/v1/conversations/${saved.conversationId}/workspace`); allow('GET', `/v1/conversations/${saved.conversationId}/generation-requests`); allow('GET', `/v1/versions/${saved.script.id}`);
        await page.goto('/saved-work.html'); await page.waitForFunction(() => !!(window as unknown as { savedWorkTest?: unknown }).savedWorkTest);
        await page.evaluate(input => (window as unknown as { savedWorkTest: { configure(input: unknown): void } }).savedWorkTest.configure(input), { apiOrigin: target.origin, token: target.accessTokens[0]!, accountId: saved.accountId, conversationId: saved.conversationId });
      };
      const videoAccess: OperationResponse<'media'>[] = [];
      let refreshing = false, token = target.accessTokens[0]!;
      // Fixture sessions are short-lived; across the expiry wait the owner supplies a current token, as a refreshed session would.
      const renew = async () => {
        token = (await target.refreshAccessTokens())[0]!;
        await page.evaluate(value => (window as unknown as { savedWorkTest: { rotateToken(token: string): void } }).savedWorkTest.rotateToken(value), token);
      };
      await page.route(url => url.origin === target.origin && [saved.image.id, saved.video.id].some(id => url.pathname === `/v1/versions/${id}/media`), async route => {
        const response = await route.fetch(); expect(response.status()).toBe(200);
        const access = await response.json() as OperationResponse<'media'>;
        if (access.poster) {
          // Playback reads browser-chosen byte ranges, then Download reads the whole object once.
          // A pre-expiry refresh reloads the same paused source once; it never repeats the download.
          videoAccess.push(access); materialNetwork.expectObjectTransfer(access.url, refreshing ? 1 : 2, 'GET', 6); materialNetwork.expectObjectTransfer(access.poster, 1, 'GET', 1);
        } else materialNetwork.expectObjectTransfer(access.url, 1, 'GET');
        await route.fulfill({ response });
      });
      const objectResponses: { url: string; status: number; range: string | null }[] = [];
      page.on('response', response => { if (new URL(response.url()).searchParams.has('X-Amz-Signature')) objectResponses.push({ url: response.url(), status: response.status(), range: response.headers()['content-range'] ?? null }); });
      // An uploaded video plays without a Script/Shot plan: decoded picture and embedded audio, ranged private transport, exact download bytes.
      const playAndDownload = async (byteSize: number) => {
        const clip = page.locator('.wp-clip-media');
        await expect(page.locator('.wp-clip-surface[data-ready="true"]')).toHaveCount(1);
        expect(await clip.evaluate(node => [(node as HTMLVideoElement).videoWidth, (node as HTMLVideoElement).videoHeight])).toEqual([320, 180]);
        await page.getByRole('button', { name: 'Play', exact: true }).click();
        await expect.poll(() => clip.evaluate(node => { const video = node as HTMLVideoElement & { webkitAudioDecodedByteCount: number }; return video.getVideoPlaybackQuality().totalVideoFrames > 0 && video.webkitAudioDecodedByteCount > 0; }), { timeout: 10000 }).toBe(true);
        await expect.poll(() => page.locator('.wp-clip-surface').getAttribute('data-player-status')).toBe('ended');
        await page.getByRole('slider', { name: 'Seek' }).fill('500');
        await expect.poll(() => clip.evaluate(node => (node as HTMLVideoElement).currentTime)).toBeCloseTo(0.5, 1);
        const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download', exact: true }).click()]);
        expect(download.suggestedFilename()).toBe('version-1.mp4');
        expect(createHash('sha256').update(await readFile(await download.path())).digest('hex')).toBe(createHash('sha256').update(media.videoBytes).digest('hex'));
        const access = videoAccess.at(-1)!;
        const transfers = objectResponses.filter(response => response.url === access.url);
        expect(transfers.some(response => response.status === 206 && new RegExp(`^bytes \\d+-\\d+/${byteSize}$`).test(response.range ?? '')), 'Playback reads private byte ranges').toBe(true);
        const slice = await fetch(access.url, { headers: { Range: 'bytes=100-199' } });
        expect([slice.status, slice.headers.get('content-range')]).toEqual([206, `bytes 100-199/${byteSize}`]);
        expect(Buffer.from(await slice.arrayBuffer()).equals(media.videoBytes.subarray(100, 200))).toBe(true);
        const unsigned = new URL(access.url); unsigned.search = '';
        const denied = await fetch(unsigned); await denied.body?.cancel();
        expect(denied.status).toBe(403);
        await expect(page.getByText('Playing or downloading does not use this version or choose it for a Shot.', { exact: true })).toBeVisible();
        // Actual emulator expiry: the mounted clip reacquires the same exact version before expiry, then the first grant stops working.
        await renew();
        refreshing = true; allow('GET', `/v1/versions/${saved.video.id}/media`);
        await expect.poll(() => videoAccess.length, { timeout: 70000 }).toBe(2);
        expect(videoAccess[1]!.url).not.toBe(access.url);
        await expect(page.locator('.wp-clip-surface[data-ready="true"]')).toHaveCount(1);
        await new Promise(done => setTimeout(done, Math.max(0, Date.parse(access.expiresAt) - Date.now()) + 2000));
        const expired = await fetch(access.url, { headers: { Range: 'bytes=0-0' } }); await expired.body?.cancel();
        expect(expired.status).toBe(403);
        await expect(page.locator('.wp-clip-surface[data-ready="true"]')).toHaveCount(1);
        await renew();
      };
      await configure(); allow('GET', '/v1/library'); await page.getByRole('button', { name: 'Library', exact: true }).click();
      for (const version of [saved.image, saved.video]) {
        assert.ok('media' in version);
        allow('GET', `/v1/versions/${version.id}`); allow('GET', `/v1/versions/${version.id}/media`);
        const tile = page.locator(`[data-page-id="${version.artifactId}"]`).locator('..');
        await tile.getByRole('button', { name: /^Inspect / }).click();
        if (version.kind === 'video') await playAndDownload(version.media.byteSize);
        else {
          const image = page.getByRole('img', { name: 'Saved image', exact: true });
          await expect(image).toHaveAttribute('src', /^blob:/); await expect(image).toBeVisible(); await expect(page.locator('video')).toHaveCount(0);
          expect(await image.evaluate(node => ({ width: (node as HTMLImageElement).naturalWidth, height: (node as HTMLImageElement).naturalHeight }))).toEqual({ width: version.media.width, height: version.media.height });
        }
        await page.getByRole('button', { name: 'Back to Library', exact: true }).click();
        await expect(tile.getByRole('button', { name: /^Inspect / })).toBeFocused();
      }
      expect(materialNetwork.entries.filter(entry => entry.method === 'POST')).toHaveLength(0);
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      await page.getByRole('tab', { name: 'Assets', exact: true }).click(); allow('GET', `/v1/versions/${saved.reference.id}`);
      await page.locator('.wp-asset-row').filter({ hasText: 'Ada reference' }).click();
      await page.getByRole('button', { name: 'Edit Description', exact: true }).click();
      const description = page.getByRole('textbox', { name: 'Description', exact: true }); await description.fill('Keep my reference description and exact image.');
      allow('GET', '/v1/library', { kind: 'image' }); await page.getByRole('button', { name: 'Add image from Library', exact: true }).click();
      allow('GET', `/v1/versions/${saved.image.id}/media`); await page.getByRole('button', { name: 'Inspect image', exact: true }).click();
      await expect(page.getByRole('img', { name: 'Exact saved image', exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Add this exact image', exact: true }).click();
      await expect(description).toHaveValue('Keep my reference description and exact image.');
      await expect(page.getByRole('button', { name: 'Remove Unspecified view', exact: true })).toBeVisible();
      assert.ok('content' in saved.reference);
      const original = saved.reference.content as { subject: Record<string, unknown> };
      const newer = await fetch(`${target.origin}/v1/conversations/${saved.conversationId}/versions`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ operationId: randomUUID(), artifactId: saved.reference.artifactId, kind: 'reference', baseVersionId: saved.reference.id, dependencies: [], content: { ...original, subject: { ...original.subject, description: 'A concurrent saved description.' } } }) });
      expect(newer.status).toBe(200); await newer.body?.cancel();
      const path = `/v1/conversations/${saved.conversationId}/versions`, commands: OperationRequest<'saveVersion'>['body'][] = [];
      await page.route(url => url.origin === target.origin && url.pathname === path, async route => {
        commands.push(route.request().postDataJSON() as OperationRequest<'saveVersion'>['body']); const response = await route.fetch();
        if (commands.length === 2) { expect(response.status()).toBe(200); savedReferenceId = (await response.json() as OperationResponse<'saveVersion'>).version.id; await route.abort('failed'); }
        else await route.fulfill({ response });
      });
      allow('POST', path); await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('A newer version was saved.');
      await expect(description).toHaveValue('Keep my reference description and exact image.'); await expect(page.getByRole('button', { name: 'Remove Unspecified view', exact: true })).toBeVisible();
      expect(commands[0]?.baseVersionId).toBe(saved.reference.id); expect(commands[0]?.dependencies).toEqual([saved.image.id]);
      allow('GET', `/v1/artifacts/${saved.reference.artifactId}/versions`, { limit: '1' }); await page.getByRole('button', { name: 'Review latest version', exact: true }).click();
      await page.getByRole('button', { name: 'Continue with my text', exact: true }).click();
      allow('POST', path); await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('Save could not be confirmed.'); await expect(description).toHaveAttribute('readonly', '');
      await expect(page.getByRole('button', { name: 'Add image from Library', exact: true })).toBeDisabled();
      allow('POST', path); await page.getByRole('button', { name: 'Retry save', exact: true }).click();
      await expect(description).toHaveCount(0); expect(commands[2]).toEqual(commands[1]); expect(commands[1]?.operationId).not.toBe(commands[0]?.operationId); expect(commands[1]?.dependencies).toEqual([saved.image.id]);
      await expect(page.getByText('1 exact image associations supplied.', { exact: false })).toBeVisible();
    } finally { await backend.close(); }
  } finally { await media.close(); }
});
