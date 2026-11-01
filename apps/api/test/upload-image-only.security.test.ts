import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { Pool } from 'pg';
import { PostgresStore } from '@mastra/pg';
import { createOwnedConversationCheck } from '../src/agent/index.js';
import { createMediaVerifier, createUploadCoordinator } from '../src/artifacts/index.js';
import { uploadRecords } from '../src/artifacts/uploads/records.js';
import { completeUpload } from '../src/artifacts/uploads/completion.js';
import { createMediaSandbox, createPrivateObjectStorage } from '../src/storage/index.js';
import { MEDIA_ARCHIVE } from '../src/storage/media/pins.js';
import { isolatedPostgres } from './postgres.js';
import { isolatedObjectStorage } from './object-storage.js';
import { applyArtifactMigrations } from './artifact-database.js';
import { createNativeConversation } from './native-conversations.js';
import { qualifiedMediaFixtures } from './media-fixtures.js';

const refusal = { code: 'unsupported', message: 'Video uploads are temporarily unavailable. Use JPEG or PNG.' };
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

test('image-only upload admission refuses new and previously issued video uploads before external work', { timeout: 90000 }, async t => {
  const db = await isolatedPostgres(); t.after(db.close);
  const service = await isolatedObjectStorage(); t.after(service.close);
  const docker = await realpath('/usr/local/bin/docker');
  const sandbox = await createMediaSandbox({ toolchainDirectory: resolve(`outputs/toolchains/ffmpeg-${MEDIA_ARCHIVE.sha256}`), dockerPath: docker }); t.after(() => sandbox.close());
  const native = new PostgresStore({ id: 'image-only-uploads', connectionString: db.setupUrl, schemaName: 'mastra' });
  const pool = new Pool({ connectionString: db.servingUrl, max: 2 });
  const setup = new Pool({ connectionString: db.setupUrl, max: 1 });
  const storage = createPrivateObjectStorage({ endpoint: service.endpoint, bucket: service.bucket, region: 'us-east-1', credentials: service.credentials });
  try {
    await native.init(); await db.grantServing(); await applyArtifactMigrations(db.setupUrl);
    const account = 'image-only-owner', conversation = (await createNativeConversation(native, account)).id;
    // Ordinary synthetic decoder fixtures are not qualification of user video upload.
    const fixtures = await qualifiedMediaFixtures(sandbox, docker), verify = createMediaVerifier(sandbox);
    const effects = { signing: 0, reads: 0, publication: 0, inspection: 0 };
    const guarded = { ...storage,
      presignPut: async (...args: Parameters<typeof storage.presignPut>) => { effects.signing++; return storage.presignPut(...args); },
      read: async (...args: Parameters<typeof storage.read>) => { effects.reads++; return storage.read(...args); },
      publish: async (...args: Parameters<typeof storage.publish>) => { effects.publication++; return storage.publish(...args); },
    };
    const uploads = createUploadCoordinator(pool, createOwnedConversationCheck(native), { storage: guarded, verifyMedia: async input => { effects.inspection++; return verify(input); } });
    const video = { operationId: randomUUID(), kind: 'video' as const, filename: 'ordinary.mp4', contentType: 'video/mp4', byteSize: fixtures.video.length, intendedUse: { purpose: 'reference' as const } };
    // Persistence-only setup represents a grant issued before the restriction; no
    // test-only enable switch or successful verification/publication is supplied.
    const previous = await uploadRecords(pool).request(account, conversation, video, null);
    const oldUrl = await storage.presignPut({ key: previous.staging_key, byteSize: fixtures.video.length, contentType: video.contentType, issuedAt: previous.issued_at, expiresAt: previous.expires_at });
    const put = await fetch(oldUrl, { method: 'PUT', headers: { 'Content-Type': video.contentType }, body: new Uint8Array(fixtures.video), signal: AbortSignal.timeout(3000) });
    assert.equal(put.status, 200); await put.body?.cancel();
    await t.test('new video authorization and old grant replay are refused', async () => {
      await assert.rejects(uploads.request(account, conversation, { ...video, operationId: randomUUID() }), refusal);
      await assert.rejects(uploads.request(account, conversation, video), refusal, 'An old authorization identity cannot reacquire transfer access');
    });
    const operation = randomUUID();
    await t.test('old video confirmation and replay are refused', async () => {
      await assert.rejects(uploads.confirm(account, previous.upload_id, operation), refusal);
      await assert.rejects(uploads.confirm(account, previous.upload_id, operation), refusal);
    });
    assert.deepEqual(effects, { signing: 0, reads: 0, publication: 0, inspection: 0 });
    const lease = randomUUID();
    await pool.query("UPDATE artifacts.uploads SET state='processing',lease_token=$2,lease_expires_at=clock_timestamp()+interval '1 minute' WHERE upload_id=$1", [previous.upload_id, lease]);
    await assert.rejects(uploads.confirm(account, previous.upload_id, randomUUID()), refusal, 'Previously leased video is denied before claim or inspection');
    await assert.rejects(uploads.request('foreign-owner', conversation, video), { code: 'not_found' });
    await assert.rejects(uploads.confirm('foreign-owner', previous.upload_id, operation), { code: 'not_found' });
    await assert.rejects(uploads.confirm(account, randomUUID(), operation), { code: 'not_found' });
    assert.deepEqual(effects, { signing: 0, reads: 0, publication: 0, inspection: 0 });
    assert.deepEqual((await pool.query('SELECT (SELECT count(*)::int FROM artifacts.versions) AS versions,(SELECT count(*)::int FROM artifacts.media_objects) AS pointers,(SELECT count(*)::int FROM artifacts.conversation_uses) AS uses,(SELECT count(*)::int FROM artifacts.manual_changes) AS approvals,(SELECT count(*)::int FROM artifacts.upload_confirmations) AS confirmations,(SELECT count(*)::int FROM artifacts.upload_objects WHERE purpose<>\'staging\') AS candidates')).rows, [{ versions: 0, pointers: 0, uses: 0, approvals: 0, confirmations: 0, candidates: 0 }]);
    for (const [bytes, contentType] of [[fixtures.png, 'image/png'], [fixtures.jpeg, 'image/jpeg']] as const) {
      const input = { operationId: randomUUID(), kind: 'image' as const, filename: contentType === 'image/png' ? 'ordinary.png' : 'ordinary.jpg', contentType, byteSize: bytes.length, intendedUse: { purpose: 'reference' as const } };
      const grant = await uploads.request(account, conversation, input);
      assert.deepEqual(await uploads.request(account, conversation, input), grant);
      const response = await fetch(grant.url, { method: 'PUT', headers: { 'Content-Type': contentType }, body: new Uint8Array(bytes), signal: AbortSignal.timeout(3000) }); assert.equal(response.status, 200); await response.body?.cancel();
      const confirmation = randomUUID(), saved = await uploads.confirm(account, grant.uploadId, confirmation);
      assert.equal(saved.version.kind, 'image'); assert.equal(saved.version.createdBy, 'human'); assert.equal(saved.use?.state, 'draft');
      assert.deepEqual(await uploads.confirm(account, grant.uploadId, confirmation), saved);
      const access = await uploads.media(account, saved.version.id), original = await fetch(access.url, { credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' });
      assert.equal(original.status, 200); assert.equal(hash(new Uint8Array(await original.arrayBuffer())), hash(bytes));
      assert.equal(access.measured.width, 240); assert.equal(access.measured.height, 240);
      // The atomic final fence rejects a video row before using any publication
      // facts. This actual image result is not a video verification verdict.
      await assert.rejects(completeUpload(pool, previous, lease, { key: `published/${previous.upload_id}/${lease}`, sha256: hash(bytes), media: saved.version.media }), refusal);
      // Isolate the cached-result branch with a real saved image result, without
      // seeding a video version or claiming a successful video verification.
      await setup.query("UPDATE artifacts.uploads SET kind='video',content_type='video/mp4' WHERE upload_id=$1", [grant.uploadId]);
      await assert.rejects(uploads.confirm(account, grant.uploadId, confirmation), refusal, 'A video-kind row cannot return even a parseable historical cached result');
    }
    assert.equal(effects.inspection, 2); assert.equal(effects.publication, 2);
    assert.deepEqual((await pool.query('SELECT (SELECT count(*)::int FROM artifacts.versions) AS versions,(SELECT count(*)::int FROM artifacts.media_objects) AS pointers,(SELECT count(*)::int FROM artifacts.conversation_uses) AS uses,(SELECT count(*)::int FROM artifacts.manual_changes) AS approvals')).rows, [{ versions: 2, pointers: 2, uses: 2, approvals: 0 }]);
  } finally { storage.close(); await native.close(); await pool.end(); await setup.end(); }
});
