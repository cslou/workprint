import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createOwnedConversationCheck } from '../../src/agent/index.js';
import { createMediaVerifier, createUploadCoordinator } from '../../src/artifacts/index.js';
import { publishVersion } from '../../src/artifacts/publication.js';
import { uploadRecords } from '../../src/artifacts/uploads/records.js';
import { transaction } from '../../src/db/index.js';
import { createMediaSandbox, createPrivateObjectStorage } from '../../src/storage/index.js';
import { testStack } from './test-stack.js';
import { cleanupFailedFixture, cleanupFixtureResources } from './fixture-observation.js';
import { prepareLibraryReuseWork } from './library-reuse-work.js';
import type { SavedWorkSetup } from './auth-built-fixture.js';

/** The shared stack's storage and trusted generated historical media. No video authorization/confirmation. */
export async function createLibraryMediaFixture() {
  const stack = testStack();
  let ownedStorage: ReturnType<typeof createPrivateObjectStorage> | undefined;
  let ownedSandbox: Awaited<ReturnType<typeof createMediaSandbox>> | undefined;
  const cleanup = () => cleanupFixtureResources([() => ownedSandbox?.close(), () => ownedStorage?.close()]);
  try {
    const media = stack.media.toolchain;
    const configuration = stack.storage;
    const storage = ownedStorage = createPrivateObjectStorage(configuration);
    const sandbox = ownedSandbox = await createMediaSandbox(media);
    const fixtures = stack.media, poster = stack.media.poster;
    return { configuration, media, imageBytes: fixtures.png, posterBytes: poster, videoBytes: fixtures.video,
      async prepare(setup: SavedWorkSetup) {
        const work = await prepareLibraryReuseWork(setup), pool = new Pool({ connectionString: setup.servingUrl, max: 2 });
        try {
          const uploads = createUploadCoordinator(pool, createOwnedConversationCheck(setup.native), { storage, verifyMedia: createMediaVerifier(sandbox) });
          const grant = await uploads.request(work.accountId, work.conversationId, { operationId: randomUUID(), kind: 'image', filename: 'synthetic.png', contentType: 'image/png', byteSize: fixtures.png.length });
          const put = await fetch(grant.url, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: new Uint8Array(fixtures.png) }); assert.equal(put.status, 200); await put.body?.cancel();
          const image = (await uploads.confirm(work.accountId, grant.uploadId, randomUUID())).version;
          // An existing saved-video prerequisite, not a bypass of the disabled product admission.
          // Bytes are generated and fully decoded at stack startup; this does not qualify the deferred MP4 parser.
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
