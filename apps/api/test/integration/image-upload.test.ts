import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { crc32 } from 'node:zlib';
import { describe, test } from 'node:test';
import { Pool } from 'pg';
import { PostgresStore } from '@mastra/pg';
import { createOwnedConversationCheck } from '../../src/agent/index.js';
import { createArtifactStore, createGeneratedImages, createMediaVerifier, createUploadCoordinator } from '../../src/artifacts/index.js';
import { createGeneratedImageSaver, createImageInputReader } from '../../src/application/index.js';
import { uploadRecords } from '../../src/artifacts/uploads/records.js';
import { completeUpload } from '../../src/artifacts/uploads/completion.js';
import { inspectMediaBytes } from '../../src/artifacts/uploads/media-bytes.js';
import { createMediaSandbox, createPrivateObjectStorage, MediaProcessError } from '../../src/storage/index.js';
import { pngChunk, testPng } from '../support/meta-image-fake.js';
import { testStack } from '../support/test-stack.js';
import { applyArtifactMigrations } from '../support/artifact-database.js';
import { createNativeConversation } from '../support/native-conversations.js';

const refusal = { code: 'unsupported', message: 'Video uploads are temporarily unavailable. Use JPEG or PNG.' };
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

test('image-only upload admission refuses new and previously issued video uploads before external work', { timeout: 90000 }, async t => {
  const db = await testStack().testDatabase(); t.after(db.close);
  const { storage: service, media } = testStack();
  const sandbox = await createMediaSandbox(media.toolchain); t.after(() => sandbox.close());
  const native = new PostgresStore({ id: 'image-only-uploads', connectionString: db.setupUrl, schemaName: 'mastra' });
  const pool = new Pool({ connectionString: db.servingUrl, max: 2 });
  const setup = new Pool({ connectionString: db.setupUrl, max: 1 });
  const storage = createPrivateObjectStorage(service);
  try {
    await native.init(); await db.grantServing(); await applyArtifactMigrations(db.setupUrl);
    const account = 'image-only-owner', conversation = (await createNativeConversation(native, account)).id;
    // Ordinary synthetic decoder fixtures are not qualification of user video upload.
    const fixtures = media, verify = createMediaVerifier(sandbox);
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

test('the real decoder accepts exact PNG, JPEG and H264+AAC and rejects damaged or mislabelled bytes', { timeout: 30000 }, async () => {
  const fixtures=testStack().media;const sandbox=await createMediaSandbox(fixtures.toolchain);
  try {
    const verify=createMediaVerifier(sandbox),signal=new AbortController().signal;
    for(const [bytes,contentType] of [[fixtures.png,'image/png'],[fixtures.jpeg,'image/jpeg']] as const){
      const before=Buffer.from(bytes);const media=await verify({kind:'image',bytes,contentType,signal});assert.equal(media.width,240);assert.equal(media.height,240);assert.equal(media.byteSize,bytes.length);assert.equal(media.poster,undefined);assert.deepEqual(bytes,before);
    }
    const video=await verify({kind:'video',bytes:fixtures.video,contentType:'video/mp4',signal});assert.equal(video.width,320);assert.equal(video.height,180);assert.equal(video.durationMs,1000);assert.equal(video.hasAudio,true);assert.ok(video.poster);assert.deepEqual(inspectMediaBytes(video.poster.bytes,'image','image/png'),{width:320,height:180});
    for(const [kind,bytes,contentType] of [['image',fixtures.jpeg,'image/png'],['image',fixtures.png.subarray(0,fixtures.png.length-1),'image/png'],['image',fixtures.jpeg.subarray(0,fixtures.jpeg.length-2),'image/jpeg'],['video',fixtures.video.subarray(0,fixtures.video.length-1),'video/mp4']] as const)await assert.rejects(verify({kind,bytes,contentType,signal}),{code:'invalid_input'});
    const badCrc=Buffer.from(fixtures.png);badCrc[50]=badCrc[50]!^1;await assert.rejects(verify({kind:'image',bytes:badCrc,contentType:'image/png',signal}),{code:'invalid_input'});
    const oversized=Buffer.from(fixtures.png);oversized.writeUInt32BE(4097,16);oversized.writeUInt32BE(crc32(oversized.subarray(12,29)),29);await assert.rejects(verify({kind:'image',bytes:oversized,contentType:'image/png',signal}),{code:'unsupported'});
    // Structurally complete MP4 with damaged actual H264 bytes: metadata alone must not qualify it.
    const damaged=Buffer.from(fixtures.video);const mdat=damaged.indexOf(Buffer.from('mdat'));assert.ok(mdat>0);damaged.fill(255,mdat+4,Math.min(damaged.length,mdat+1000));await assert.rejects(verify({kind:'video',bytes:damaged,contentType:'video/mp4',signal}));
    const captured=Buffer.from(fixtures.png);const pending=verify({kind:'image',bytes:captured,contentType:'image/png',signal});captured.fill(0);assert.equal((await pending).width,240,'The child uses the synchronous immutable snapshot, not later caller bytes');
  } finally {await sandbox.close();}
});

describe('assistant-made images are checked, saved privately as the video\'s drafts, and readable as inputs', { timeout: 120000 }, () => {
  test('save, refusals, media access and the input read', async t => {
    const db = await testStack().testDatabase(); t.after(db.close);
    const { storage: service, media: fixtures } = testStack();
    const sandbox = await createMediaSandbox(fixtures.toolchain); t.after(() => sandbox.close());
    const native = new PostgresStore({ id: 'generated-images', connectionString: db.setupUrl, schemaName: 'mastra' });
    const pool = new Pool({ connectionString: db.servingUrl, max: 4 }), setup = new Pool({ connectionString: db.setupUrl, max: 1 });
    const storage = createPrivateObjectStorage(service);
    try {
      await native.init(); await db.grantServing(); await applyArtifactMigrations(db.setupUrl);
      const account = 'generated-owner', foreign = 'generated-other', builtin = 'workprint-built-in';
      const video = (await createNativeConversation(native, account)).id, otherVideo = (await createNativeConversation(native, account)).id;
      const foreignVideo = (await createNativeConversation(native, foreign)).id, builtinOrigin = (await createNativeConversation(native, builtin)).id;
      const check = createOwnedConversationCheck(native), store = createArtifactStore(pool, check), verify = createMediaVerifier(sandbox);
      const effects = { published: [] as string[], removed: [] as string[], checks: 0 };
      const counted = { ...storage,
        publish: async (...args: Parameters<typeof storage.publish>) => { effects.published.push(args[0]); return storage.publish(...args); },
        remove: async (key: string) => { effects.removed.push(key); return storage.remove(key); },
      };
      // The checker answers busy once, as the one-job sandbox does when another check is running.
      let busyOnce = true;
      const images = createGeneratedImages(pool, check, { storage: counted, capacityRetryMs: 20, verifyMedia: async input => {
        effects.checks++;
        if (busyOnce) { busyOnce = false; throw new MediaProcessError('capacity'); }
        return verify(input);
      } });
      const save = createGeneratedImageSaver(images.save), readInputs = createImageInputReader(store, images.read);
      const counts = async () => (await pool.query<{ versions: number; media: number; generated: number; uses: number }>('SELECT (SELECT count(*)::int FROM artifacts.versions) AS versions,(SELECT count(*)::int FROM artifacts.media_objects) AS media,(SELECT count(*)::int FROM artifacts.generated_objects) AS generated,(SELECT count(*)::int FROM artifacts.conversation_uses) AS uses')).rows[0];

      const made = testPng({ seed: 5 });
      const saved = await save(account, video, { bytes: made, contentType: 'image/png', inputs: [] });
      assert.deepEqual(saved, { kind: 'saved', versionId: (saved as { versionId: string }).versionId, width: 64, height: 48 });
      if (saved.kind !== 'saved') return;
      assert.equal(effects.checks, 2, 'a busy checker is waited out, then the image is checked once');
      const row = (await pool.query('SELECT v.created_by,v.provenance,v.revision,g.sha256,g.byte_size::int AS byte_size,u.state,u.purpose FROM artifacts.versions v JOIN artifacts.generated_objects g ON g.version_id=v.version_id JOIN artifacts.conversation_uses u ON u.version_id=v.version_id WHERE v.version_id=$1', [saved.versionId])).rows;
      assert.deepEqual(row, [{ created_by: 'assistant', provenance: 'assistant', revision: 1, sha256: hash(made), byte_size: made.length, state: 'draft', purpose: 'reference' }]);
      assert.deepEqual(effects.published, [`published/${effects.published[0]!.split('/')[1]}/${effects.published[0]!.split('/')[1]}`]);
      assert.equal(hash((await storage.read(effects.published[0]!)).bytes), hash(made));
      const workspace = await store.workspace(account, video);
      assert.deepEqual(workspace.assets.map(asset => [asset.version.id, asset.version.createdBy, asset.state]), [[saved.versionId, 'assistant', 'Draft']]);
      const uploads = createUploadCoordinator(pool, check, { storage, verifyMedia: verify });
      const access = await uploads.media(account, saved.versionId), signed = await fetch(access.url, { credentials: 'omit', redirect: 'error' });
      assert.equal(signed.status, 200); assert.equal(hash(new Uint8Array(await signed.arrayBuffer())), hash(made));
      for (const [objectKey, generatedKey] of [[effects.published[0]!, effects.published[0]!], [null, null]]) {
        await assert.rejects(pool.query('INSERT INTO artifacts.media_objects(owner_id,version_id,object_key,generated_key,sha256) VALUES($1,$2,$3,$4,$5)', [account, randomUUID(), objectKey, generatedKey, hash(made)]), { code: '23514' }, 'exactly one source');
      }

      await t.test('refused bytes, a foreign video and a checker that stays busy save nothing', async () => {
        const before = await counts(), published = effects.published.length;
        const labelled = testPng({ before: [pngChunk('tEXt', Buffer.from('Comment\0hello', 'latin1'))] });
        assert.deepEqual(await save(account, video, { bytes: labelled, contentType: 'image/png', inputs: [] }), { kind: 'refused' });
        assert.deepEqual(await save(foreign, video, { bytes: made, contentType: 'image/png', inputs: [] }), { kind: 'not_found' });
        const busy = createGeneratedImages(pool, check, { storage: counted, capacityWaitMs: 200, capacityRetryMs: 20, verifyMedia: async () => { throw new MediaProcessError('capacity'); } });
        const started = Date.now();
        assert.deepEqual(await createGeneratedImageSaver(busy.save)(account, video, { bytes: made, contentType: 'image/png', inputs: [] }), { kind: 'unavailable' });
        assert.ok(Date.now() - started < 2000, 'the wait is bounded');
        assert.deepEqual(await counts(), before);
        assert.equal(effects.published.length, published, 'nothing is stored');
      });

      await t.test('the input read returns the exact bytes of uploaded, made and built-in images this video uses', async () => {
        const upload = async (owner: string, target: string) => {
          const grant = await uploads.request(owner, target, { operationId: randomUUID(), kind: 'image', filename: 'ordinary.png', contentType: 'image/png', byteSize: fixtures.png.length, intendedUse: { purpose: 'reference' } });
          const put = await fetch(grant.url, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: new Uint8Array(fixtures.png), signal: AbortSignal.timeout(3000) }); assert.equal(put.status, 200); await put.body?.cancel();
          return (await uploads.confirm(owner, grant.uploadId, randomUUID())).version;
        };
        const uploaded = await upload(account, video), source = await upload(builtin, builtinOrigin), foreignImage = await upload(foreign, foreignVideo), otherImage = await upload(account, otherVideo);
        await setup.query('UPDATE artifacts.artifacts SET built_in=true WHERE owner_id=$1 AND artifact_id=$2', [builtin, source.artifactId]);
        await pool.query("INSERT INTO artifacts.conversation_uses(owner_id,conversation_id,use_id,version_id,binding,purpose,state) VALUES($1,$2,$3,$4,$5,'reference','draft')", [account, video, randomUUID(), source.id, { purpose: 'reference' }]);
        const read = await readInputs(account, video, [uploaded.id, saved.versionId, source.id]);
        assert.equal(read.kind, 'read');
        if (read.kind !== 'read') return;
        assert.deepEqual(read.images.map(image => image.versionId), [uploaded.id, saved.versionId, source.id]);
        assert.deepEqual(read.images.map(image => hash(Buffer.from(image.dataUrl.replace('data:image/png;base64,', ''), 'base64'))), [hash(fixtures.png), hash(made), hash(fixtures.png)]);
        // Another account's image, or this account's image used only by another video, fails the whole call.
        for (const id of [foreignImage.id, otherImage.id]) assert.deepEqual(await readInputs(account, video, [uploaded.id, id]), { kind: 'not_found' });
        assert.deepEqual(await readInputs(foreign, video, [uploaded.id]), { kind: 'not_found' });
        // A made image saved with inputs records them as its dependencies.
        const edited = await save(account, video, { bytes: testPng({ seed: 6 }), contentType: 'image/png', inputs: [uploaded.id, source.id] });
        assert.equal(edited.kind, 'saved');
        if (edited.kind === 'saved') assert.deepEqual((await store.version(account, edited.versionId)).dependencies, [uploaded.id, source.id]);
        // Stored bytes that no longer match the saved record are an error, never a data URL.
        const tampered = createGeneratedImages(pool, check, { storage: { ...storage, read: async (...args: Parameters<typeof storage.read>) => { const stored = await storage.read(...args); const bytes = Buffer.from(stored.bytes); bytes.writeUInt8(bytes.readUInt8(bytes.length - 20) ^ 1, bytes.length - 20); return { ...stored, bytes }; } }, verifyMedia: verify });
        assert.deepEqual(await createImageInputReader(store, tampered.read)(account, video, [saved.versionId]), { kind: 'unavailable' });
      });
    } finally { storage.close(); await native.close(); await pool.end(); await setup.end(); }
  });
});
