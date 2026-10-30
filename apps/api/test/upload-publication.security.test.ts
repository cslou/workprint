import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Pool } from 'pg';
import { PostgresStore } from '@mastra/pg';
import { createOwnedConversationCheck } from '../src/agent/index.js';
import { createArtifactStore, createUploadCoordinator } from '../src/artifacts/index.js';
import { createPrivateObjectStorage, StorageError, type PrivateObjectStorage } from '../src/storage/index.js';
import { isolatedPostgres, query } from './postgres.js';
import { createNativeConversation } from './native-conversations.js';
import { applyArtifactMigrations } from './artifact-database.js';
import { isolatedObjectStorage } from './object-storage.js';

test('guarded upload core publishes one immutable snapshot, leaves approvals alone and retains cleanup references', { timeout: 180000 }, async t => {
  const database = await isolatedPostgres(); t.after(database.close);
  const service = await isolatedObjectStorage(undefined, message => t.diagnostic(message)); t.after(service.close);
  const native = new PostgresStore({ id: 'upload-publication-setup', connectionString: database.setupUrl, schemaName: 'mastra' });
  const pool = new Pool({ connectionString: database.servingUrl, max: 4, statement_timeout: 2000, application_name: 'upload-publication-proof' });
  const serving = new PostgresStore({ id: 'upload-publication-serving', schemaName: 'mastra', disableInit: true, pool });
  const objects = createPrivateObjectStorage({ endpoint: service.endpoint, bucket: service.bucket, region: 'us-east-1', credentials: service.credentials });
  try {
    await native.init(); await database.grantServing(); await applyArtifactMigrations(database.setupUrl);
    const account = 'upload-owner', conversation = await createNativeConversation(native, account);
    const assertOutsideTransaction = async () => assert.equal((await pool.query<{ count: number }>("SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name='upload-publication-proof' AND state LIKE 'idle in transaction%'")).rows[0]!.count, 0, 'Native/storage/verification waits must stay outside SQL');
    const nativeCheck = createOwnedConversationCheck(serving);
    const check: typeof nativeCheck = async (...args) => { await assertOutsideTransaction(); return nativeCheck(...args); };
    const posterSnapshot = new Uint8Array([1, 2, 3]);
    const guarded: PrivateObjectStorage = { ...objects,
      read: async (...args) => { await assertOutsideTransaction(); return objects.read(...args); },
      publish: async (...args) => { await assertOutsideTransaction(); if (args[0].startsWith('published/')) posterSnapshot.fill(9); return objects.publish(...args); },
      remove: async (...args) => { await assertOutsideTransaction(); return objects.remove(...args); },
    };
    const bytes = new TextEncoder().encode('synthetic unverified media'), changed = new TextEncoder().encode('different unverified media'); assert.equal(bytes.length, changed.length);
    let reached!: () => void, release!: () => void;
    const inspecting = new Promise<void>(resolve => { reached = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
    // This trusted TEST collaborator proves coordination only, never real decoding or production success.
    const verifyMedia = async (input: { kind: 'image' | 'video'; bytes: Uint8Array; contentType: string; signal: AbortSignal }) => {
      await assertOutsideTransaction(); reached(); await gate;
      const size = input.bytes.length; input.bytes.fill(0); // Inspection cannot mutate the captured publication bytes.
      return { kind: input.kind, contentType: input.contentType, byteSize: size, width: 1, height: 1, poster: { bytes: posterSnapshot, contentType: 'image/png' as const } };
    };
    const uploads = createUploadCoordinator(pool, check, { storage: guarded, verifyMedia });
    const request = { operationId: randomUUID(), kind: 'image' as const, filename: 'synthetic.png', contentType: 'image/png', byteSize: bytes.length, intendedUse: { purpose: 'reference' as const, role: 'subject' } };
    const grant = await uploads.request(account, conversation.id, request);
    const put = async (url: string, body: Uint8Array) => { const response = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: new Uint8Array(body), signal: AbortSignal.timeout(2000) }); await response.body?.cancel(); assert.equal(response.status, 200); };
    await put(grant.url, bytes);
    const operation = randomUUID(), pending = uploads.confirm(account, grant.uploadId, operation);
    await inspecting;
    await assert.rejects(uploads.confirm(account, grant.uploadId, randomUUID()), { code: 'integration_failure' });
    await put(grant.url, changed); release();
    const saved = await pending; assert.equal(saved.version.kind, 'image'); assert.equal(saved.use?.state, 'draft');
    const media = (await pool.query<{ object_key: string; poster_key: string; sha256: string }>('SELECT object_key,poster_key,sha256 FROM artifacts.media_objects WHERE owner_id=$1 AND version_id=$2', [account, saved.version.id])).rows[0]!;
    assert.deepEqual((await objects.read(media.object_key)).bytes, Buffer.from(bytes)); assert.deepEqual((await objects.read(media.poster_key)).bytes, Buffer.from([1, 2, 3]));
    assert.deepEqual(await uploads.confirm(account, grant.uploadId, operation), saved);
    await pool.query("UPDATE artifacts.conversation_uses SET state='approved' WHERE owner_id=$1 AND use_id=$2", [account, saved.use!.id]);
    assert.deepEqual(await uploads.confirm(account, grant.uploadId, randomUUID()), saved);
    assert.equal((await pool.query('SELECT state FROM artifacts.conversation_uses WHERE use_id=$1', [saved.use!.id])).rows[0].state, 'approved', 'Retry does not reapply or undo later decisions');
    const reads = createArtifactStore(pool, check); assert.deepEqual(await reads.version(account, saved.version.id), saved.version);
    const cleanup = await uploads.cleanup(account, grant.uploadId); assert.equal(cleanup.succeeded, 1);
    await put(grant.url, changed); // Previously deleted staging can return before URL expiry.
    const retained = (await pool.query('SELECT count(*)::int AS refs,count(protected_version_id)::int AS protected FROM artifacts.upload_objects WHERE owner_id=$1 AND upload_id=$2', [account, grant.uploadId])).rows;
    assert.deepEqual(retained, [{ refs: 3, protected: 2 }]);
    const failing = createUploadCoordinator(pool, check, { storage: { ...guarded, remove: async () => { throw new StorageError('unavailable'); } } });
    await assert.rejects(failing.cleanup(account, grant.uploadId), { code: 'integration_failure' });
    assert.equal((await pool.query('SELECT sum(cleanup_failures)::int AS failures FROM artifacts.upload_objects WHERE owner_id=$1', [account])).rows[0].failures, 1);
    await uploads.cleanup(account, grant.uploadId);
    assert.deepEqual((await objects.read(media.object_key)).bytes, Buffer.from(bytes));
    assert.deepEqual((await pool.query('SELECT count(*)::int AS versions FROM artifacts.versions')).rows, [{ versions: 1 }]);
    assert.equal((await reads.workspace(account, conversation.id)).selectionRevision, 0, 'Upload never chooses a Shot video');
    const simple = createUploadCoordinator(pool, check, { storage: guarded, verifyMedia: async input => ({ kind: input.kind, contentType: input.contentType, byteSize: input.bytes.length, width: 1, height: 1 }) });
    const nextGrant = async () => { const next = await simple.request(account, conversation.id, { ...request, operationId: randomUUID() }); await put(next.url, bytes); return next; };
    const versions = async () => (await pool.query<{ count: number }>('SELECT count(*)::int AS count FROM artifacts.versions')).rows[0]!.count;
    const uncertain = await nextGrant(); let uncertainKey = '';
    const lostStorage = createUploadCoordinator(pool, check, { storage: { ...guarded, publish: async (...args) => { uncertainKey = args[0]; await guarded.publish(...args); throw new StorageError('unavailable'); } }, verifyMedia: async input => ({ kind: input.kind, contentType: input.contentType, byteSize: input.bytes.length, width: 1, height: 1 }) });
    const uncertainOperation = randomUUID(); await assert.rejects(lostStorage.confirm(account, uncertain.uploadId, uncertainOperation), { code: 'integration_failure' });
    assert.equal(await versions(), 1); assert.deepEqual((await objects.read(uncertainKey)).bytes, Buffer.from(bytes), 'A real object committed even though its acknowledgement was lost');
    const recovered = await simple.confirm(account, uncertain.uploadId, uncertainOperation);
    const recoveredKey = (await pool.query<{ object_key: string }>('SELECT object_key FROM artifacts.media_objects WHERE version_id=$1', [recovered.version.id])).rows[0]!.object_key;
    assert.ok(recoveredKey !== uncertainKey, 'Unknown prior writes never reuse an attempt key'); assert.equal(await versions(), 2);
    await simple.cleanup(account, uncertain.uploadId); await assert.rejects(objects.read(uncertainKey), { code: 'not_found' }); assert.deepEqual((await objects.read(recoveredKey)).bytes, Buffer.from(bytes));
    const late = await nextGrant(); let lateKey = '';
    const interrupted = createUploadCoordinator(pool, check, { storage: { ...guarded, publish: async key => { lateKey = key; throw new StorageError('unavailable'); } }, verifyMedia: async input => ({ kind: input.kind, contentType: input.contentType, byteSize: input.bytes.length, width: 1, height: 1 }) });
    await assert.rejects(interrupted.confirm(account, late.uploadId, randomUUID()), { code: 'integration_failure' });
    await simple.cleanup(account, late.uploadId);
    await objects.publish(lateKey, bytes, 'image/png'); // Explicit controlled late storage completion after successful deletion.
    const tombstone = (await pool.query('SELECT protected_version_id,last_cleanup_at FROM artifacts.upload_objects WHERE owner_id=$1 AND object_key=$2', [account, lateKey])).rows[0]; assert.ok(tombstone && tombstone.last_cleanup_at); assert.equal(tombstone.protected_version_id, null);
    await simple.cleanup(account, late.uploadId); await assert.rejects(objects.read(lateKey), { code: 'not_found' }); assert.equal(await versions(), 2);
    await query(database.setupUrl, "CREATE FUNCTION artifacts.fixture_upload_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Owned upload publication failure'; END $$");
    try {
      for (const table of ['versions', 'media_objects', 'conversation_uses', 'uploads']) {
        const failed = await nextGrant();
        const event = table === 'uploads' ? "UPDATE ON artifacts.uploads FOR EACH ROW WHEN (NEW.state='confirmed')" : `INSERT ON artifacts.${table} FOR EACH ROW`;
        await query(database.setupUrl, `CREATE TRIGGER fixture_upload_failure AFTER ${event} EXECUTE FUNCTION artifacts.fixture_upload_failure()`);
        try {
          await assert.rejects(simple.confirm(account, failed.uploadId, randomUUID()), { code: 'integration_failure' }); assert.equal(await versions(), 2, `Complete rollback after ${table}`);
          assert.deepEqual((await pool.query('SELECT count(*)::int AS refs,count(protected_version_id)::int AS protected FROM artifacts.upload_objects WHERE upload_id=$1', [failed.uploadId])).rows, [{ refs: 2, protected: 0 }], 'Reserved object references survive rolled-back publication');
        } finally { await query(database.setupUrl, `DROP TRIGGER fixture_upload_failure ON artifacts.${table}`); }
        await simple.cleanup(account, failed.uploadId);
      }
    } finally { await query(database.setupUrl, 'DROP FUNCTION artifacts.fixture_upload_failure()'); }
    await assert.rejects(pool.query('UPDATE artifacts.media_objects SET object_key=object_key'));
    await assert.rejects(pool.query('UPDATE artifacts.upload_objects SET protected_version_id=NULL WHERE protected_version_id IS NOT NULL'));
  } finally { objects.close(); await native.close(); await serving.close(); if (!pool.ended) await pool.end(); }
});
