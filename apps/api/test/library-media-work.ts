import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { createOwnedConversationCheck } from '../src/agent/index.js';
import { createMediaVerifier, createUploadCoordinator } from '../src/artifacts/index.js';
import { publishVersion } from '../src/artifacts/publication.js';
import { uploadRecords } from '../src/artifacts/uploads/records.js';
import { transaction } from '../src/db/index.js';
import { createMediaSandbox, createPrivateObjectStorage } from '../src/storage/index.js';
import { runMediaChild } from '../src/storage/media/child.js';
import { MEDIA_ARCHIVE } from '../src/storage/media/pins.js';
import { isolatedObjectStorage } from './object-storage.js';
import { qualifiedMediaFixtures } from './media-fixtures.js';
import { cleanupFailedFixture, cleanupFixtureResources, observeFixturePhase } from './fixture-observation.js';
import { prepareLibraryReuseWork } from './library-reuse-work.js';
import type { SavedWorkSetup } from './auth-built-fixture.js';

/** Owned emulator and trusted generated historical media only. No video authorization/confirmation. */
export async function createLibraryMediaFixture(browserOrigin: string, diagnostic?: (message: string) => void) {
  let ownedService: Awaited<ReturnType<typeof isolatedObjectStorage>> | undefined;
  let ownedStorage: ReturnType<typeof createPrivateObjectStorage> | undefined;
  let ownedSandbox: Awaited<ReturnType<typeof createMediaSandbox>> | undefined;
  const cleanup = () => cleanupFixtureResources([() => ownedSandbox?.close(), () => ownedStorage?.close(), () => ownedService?.close()]);
  try {
    const service = await observeFixturePhase('media.storage', async () => ownedService = await isolatedObjectStorage([browserOrigin], undefined, diagnostic), diagnostic);
    const media = { toolchainDirectory: resolve(`outputs/toolchains/ffmpeg-${MEDIA_ARCHIVE.sha256}`), dockerPath: await realpath('/usr/local/bin/docker') };
    const configuration = { endpoint: service.endpoint, bucket: service.bucket, region: 'us-east-1', credentials: service.credentials };
    const storage = ownedStorage = createPrivateObjectStorage(configuration);
    const sandbox = await observeFixturePhase('media.sandbox', async () => ownedSandbox = await createMediaSandbox(media), diagnostic);
    const fixtures = await observeFixturePhase('media.synthetic', () => qualifiedMediaFixtures(sandbox, media.dockerPath), diagnostic);
    assert.match(fixtures.progress.toString(), /progress=end/);
    const poster = await observeFixturePhase('media.poster', () => sandbox.use(fixtures.video, async job => {
      const exec = async (args: string[]) => (await runMediaChild(media.dockerPath, ['exec', job.resource.id, ...args], { timeoutMs: 5000 })).stdout;
      const probe = JSON.parse((await exec(['/tools/ffprobe', '-v', 'error', '-show_streams', '-of', 'json', '/input.bin'])).toString()) as { streams: { codec_type: string; width?: number; height?: number; codec_name: string }[] };
      assert.ok(probe.streams.some(stream => stream.codec_type === 'video' && stream.width === 320 && stream.height === 180 && stream.codec_name === 'h264'));
      assert.ok(probe.streams.some(stream => stream.codec_type === 'audio' && stream.codec_name === 'aac'));
      await exec(['/tools/ffmpeg', '-nostdin', '-v', 'error', '-threads', '1', '-i', '/input.bin', '-frames:v', '1', '-y', '/work/poster.png']);
      return exec(['/bin/cat', '/work/poster.png']);
    }), diagnostic);
    return { configuration, media, imageBytes: fixtures.png, posterBytes: poster, videoBytes: fixtures.video,
      async prepare(setup: SavedWorkSetup) {
        const work = await prepareLibraryReuseWork(setup), pool = new Pool({ connectionString: setup.servingUrl, max: 2 });
        try {
          const uploads = createUploadCoordinator(pool, createOwnedConversationCheck(setup.native), { storage, verifyMedia: createMediaVerifier(sandbox) });
          const grant = await uploads.request(work.accountId, work.conversationId, { operationId: randomUUID(), kind: 'image', filename: 'synthetic.png', contentType: 'image/png', byteSize: fixtures.png.length });
          const put = await fetch(grant.url, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: new Uint8Array(fixtures.png) }); assert.equal(put.status, 200); await put.body?.cancel();
          const image = (await uploads.confirm(work.accountId, grant.uploadId, randomUUID())).version;
          // An existing saved-video prerequisite, not a bypass of the disabled product admission.
          // Bytes are generated and fully decoded above; this does not qualify the deferred MP4 parser.
          const row = await uploadRecords(pool).request(work.accountId, work.conversationId, { operationId: randomUUID(), kind: 'video', filename: 'historical-fixture.mp4', contentType: 'video/mp4', byteSize: fixtures.video.length }, null);
          const key = `published/${row.upload_id}/${randomUUID()}`, posterKey = `posters/${row.upload_id}/${randomUUID()}`;
          const object = await storage.publish(key, fixtures.video, 'video/mp4'), preview = await storage.publish(posterKey, poster, 'image/png');
          const video = await transaction(pool, async client => {
            const version = await publishVersion(client, { accountId: work.accountId, conversationId: work.conversationId, kind: 'video', createdBy: 'human', dependencies: [], media: { contentType: 'video/mp4', byteSize: fixtures.video.length, width: 320, height: 180, durationMs: 1000, hasAudio: true } });
            await client.query("INSERT INTO artifacts.upload_objects(owner_id,object_key,upload_id,purpose,protected_version_id) VALUES($1,$2,$3,'candidate',$4),($1,$5,$3,'poster',$4)", [work.accountId, key, row.upload_id, version.id, posterKey]);
            await client.query('INSERT INTO artifacts.media_objects(owner_id,version_id,object_key,poster_key,sha256,poster_sha256) VALUES($1,$2,$3,$4,$5,$6)', [work.accountId, version.id, key, posterKey, object.sha256, preview.sha256]);
            await client.query("UPDATE artifacts.uploads SET state='confirmed',confirmed_result=$3 WHERE owner_id=$1 AND upload_id=$2", [work.accountId, row.upload_id, { version }]);
            return version;
          });
          return { ...work, image, video };
        } finally { await pool.end(); }
      },
      close: cleanup,
    };
  } catch (error) { return cleanupFailedFixture(error, cleanup); }
}
