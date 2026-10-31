import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { Pool } from 'pg';
import { PostgresStore } from '@mastra/pg';
import { savedReferenceContentSchema } from '@workprint/contracts';
import { createOwnedConversationCheck } from '../src/agent/index.js';
import { createArtifactStore, createArtifactWriters, createVersionUses, createMediaVerifier, createUploadCoordinator } from '../src/artifacts/index.js';
import { createMediaSandbox, createPrivateObjectStorage } from '../src/storage/index.js';
import { MEDIA_ARCHIVE } from '../src/storage/media/pins.js';
import { isolatedPostgres } from './postgres.js';
import { isolatedObjectStorage } from './object-storage.js';
import { applyArtifactMigrations } from './artifact-database.js';
import { createNativeConversation } from './native-conversations.js';
import { qualifiedMediaFixtures } from './media-fixtures.js';

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

test('reference edits bind verified owned/read-only images to an immutable expected base without copying or repinning other conversations', { timeout: 120000 }, async t => {
  const db = await isolatedPostgres(); t.after(db.close);
  const service = await isolatedObjectStorage(); t.after(service.close);
  const dockerPath = await realpath('/usr/local/bin/docker');
  const sandbox = await createMediaSandbox({ toolchainDirectory: resolve(`outputs/toolchains/ffmpeg-${MEDIA_ARCHIVE.sha256}`), dockerPath }); t.after(() => sandbox.close());
  const pool = new Pool({ connectionString: db.servingUrl, max: 4 }), setupPool = new Pool({ connectionString: db.setupUrl, max: 1 });
  const native = new PostgresStore({ id: 'reference-image-prerequisites', connectionString: db.setupUrl, schemaName: 'mastra' });
  const storage = createPrivateObjectStorage({ endpoint: service.endpoint, bucket: service.bucket, region: 'us-east-1', credentials: service.credentials });
  try {
    await native.init(); await db.grantServing(); await applyArtifactMigrations(db.setupUrl);
    const account = 'reference-edit-owner', foreign = 'reference-other-owner', builtin = 'workprint-built-in';
    const conversation = (await createNativeConversation(native, account)).id, other = (await createNativeConversation(native, account)).id;
    const foreignConversation = (await createNativeConversation(native, foreign)).id, builtinOrigin = (await createNativeConversation(native, builtin)).id;
    const check = createOwnedConversationCheck(native), store = createArtifactStore(pool, check), writers = createArtifactWriters(pool, check), uses = createVersionUses(pool, check);
    const fixtures = await qualifiedMediaFixtures(sandbox, dockerPath);
    const uploads = createUploadCoordinator(pool, check, { storage, verifyMedia: createMediaVerifier(sandbox) });
    const upload = async (owner: string, target: string) => {
      const grant = await uploads.request(owner, target, { operationId: randomUUID(), kind: 'image', filename: 'ordinary.png', contentType: 'image/png', byteSize: fixtures.png.length });
      const put = await fetch(grant.url, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: new Uint8Array(fixtures.png), signal: AbortSignal.timeout(3000) }); assert.equal(put.status, 200); await put.body?.cancel();
      return (await uploads.confirm(owner, grant.uploadId, randomUUID())).version;
    };
    const image = await upload(account, conversation), foreignImage = await upload(foreign, foreignConversation), sourceImage = await upload(builtin, builtinOrigin);
    await setupPool.query('UPDATE artifacts.artifacts SET built_in=true WHERE owner_id=$1 AND artifact_id=$2', [builtin, sourceImage.artifactId]);
    for (const [owner, id] of [[account, image.id], [account, sourceImage.id], [foreign, sourceImage.id]]) {
      const access = await uploads.media(owner!, id!), response = await fetch(access.url, { credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' });
      assert.equal(response.status, 200); assert.equal(hash(new Uint8Array(await response.arrayBuffer())), hash(fixtures.png));
    }
    const original = { schemaVersion: 1, subject: { id: 'ada', kind: 'character', name: 'Ada reference', description: 'A traveller.', continuityNotes: ['Keep the green coat.'] }, references: [] };
    const base = await store.insert({ accountId: account, conversationId: conversation, kind: 'reference', content: original, createdBy: 'human', dependencies: [], use: { binding: { purpose: 'reference', role: 'ada' }, state: 'draft' } });
    await uses.useVersion(account, other, { operationId: randomUUID(), purpose: 'reference', role: 'ada', versionId: base.id });
    const content = savedReferenceContentSchema.parse({ ...original, subject: { ...original.subject, description: 'A traveller carrying a small case.' }, references: [{ versionId: image.id, view: 'Front', notes: ['Keep the green coat.'] }, { versionId: sourceImage.id, view: 'Angle', notes: [] }] });
    const command = { operationId: randomUUID(), artifactId: base.artifactId, baseVersionId: base.id, kind: 'reference' as const, content, dependencies: [image.id, sourceImage.id], intendedUse: { purpose: 'reference' as const, role: 'ada' } };
    const saved = await writers.human.save(account, conversation, command);
    assert.equal(saved.version.revision, 2); assert.ok(saved.use); assert.deepEqual(saved.use.binding, { purpose: 'reference', role: 'ada' }); assert.equal(saved.use.state, 'approved');
    assert.deepEqual(await writers.human.save(account, conversation, command), saved);
    const exact = await store.version(account, saved.version.id); assert.ok('content' in exact); assert.deepEqual(exact.content, content); assert.deepEqual(exact.dependencies, command.dependencies);
    const old = await store.version(account, base.id); assert.ok('content' in old); assert.deepEqual(old.content, original);
    const unchanged = await store.workspace(account, other); assert.equal(unchanged.assets[0]?.version.id, base.id);
    await assert.rejects(writers.human.save(account, conversation, { ...command, operationId: randomUUID() }), { code: 'stale_revision' });
    await assert.rejects(writers.human.save(account, conversation, { ...command, content: { ...content, subject: { ...content.subject, description: 'A conflicting payload.' } } }), { code: 'invalid_input' });
    await assert.rejects(writers.human.save(account, conversation, { ...command, operationId: randomUUID(), baseVersionId: saved.version.id, dependencies: [foreignImage.id, sourceImage.id] }), { code: 'not_found' });
    await assert.rejects(writers.human.save(account, conversation, { ...command, operationId: randomUUID(), baseVersionId: saved.version.id, content: { ...content, subject: { ...content.subject, id: 'different-subject' } } }), { code: 'invalid_input' });
    const counts = (await pool.query('SELECT (SELECT count(*)::int FROM artifacts.artifacts) AS artifacts,(SELECT count(*)::int FROM artifacts.versions) AS versions,(SELECT count(*)::int FROM artifacts.media_objects) AS media,(SELECT count(*)::int FROM artifacts.manual_changes) AS changes')).rows;
    assert.deepEqual(counts, [{ artifacts: 4, versions: 5, media: 3, changes: 1 }], 'Association saves add only their immutable reference version; bytes and other conversation pins are unchanged');
  } finally { storage.close(); await native.close(); await pool.end(); await setupPool.end(); }
});
