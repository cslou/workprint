import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setImmediate } from 'node:timers/promises';
import { test } from 'node:test';
import { Pool, type PoolClient } from 'pg';
import { PostgresStore } from '@mastra/pg';
import { createOwnedConversationCheck } from '../src/agent/index.js';
import { createArtifactStore, createArtifactWriters, createUploadCoordinator, type MediaVerifier } from '../src/artifacts/index.js';
import { createPrivateObjectStorage } from '../src/storage/index.js';
import { isolatedPostgres } from './postgres.js';
import { isolatedObjectStorage } from './object-storage.js';
import { applyArtifactMigrations } from './artifact-database.js';
import { createNativeConversation } from './native-conversations.js';

test('publication lock order and final upload lease fences survive real concurrent writes', { timeout: 180000 }, async t => {
  const db = await isolatedPostgres(); t.after(db.close);
  const service = await isolatedObjectStorage(undefined, message => t.diagnostic(message)); t.after(service.close);
  const pool = new Pool({ connectionString: db.servingUrl, max: 4, application_name: 'upload-owner-order', statement_timeout: 2000 });
  const manualPool = new Pool({ connectionString: db.servingUrl, max: 2, application_name: 'manual-owner-order', statement_timeout: 2000 });
  const setup = new Pool({ connectionString: db.setupUrl, max: 2 });
  const native = new PostgresStore({ id: 'upload-locks-setup', connectionString: db.setupUrl, schemaName: 'mastra' });
  const objects = createPrivateObjectStorage({ endpoint: service.endpoint, bucket: service.bucket, region: 'us-east-1', credentials: service.credentials });
  try {
    await native.init(); await db.grantServing(); await applyArtifactMigrations(db.setupUrl);
    const account = 'publication-lock-owner', conversation = (await createNativeConversation(native, account)).id;
    const owned = createOwnedConversationCheck(native), reads = createArtifactStore(pool, owned);
    const script = await reads.insert({ accountId: account, conversationId: conversation, kind: 'script', createdBy: 'human', dependencies: [], content: { schemaVersion: 1, scenes: [{ heading: { setting: 'interior', location: 'Station', time: 'morning' }, characters: [], script: [{ action: 'A traveller waits.' }] }] } });
    const plan = { schemaVersion: 1, sourceScriptVersionId: script.id, shots: [{ shotId: 'shot', order: 0, intent: 'A traveller waits.', panels: [{ panelId: 'panel', order: 0, description: 'The station clock.', references: [] }] }] };
    const board = await reads.insert({ accountId: account, conversationId: conversation, kind: 'storyboard', content: plan, dependencies: [script.id], createdBy: 'human', use: { binding: { purpose: 'storyboard' }, state: 'approved' } });
    // Trusted test-only inspection: synthetic bytes prove mechanics, not media decoding.
    const inspect: MediaVerifier = async input => ({ kind: input.kind, contentType: input.contentType, byteSize: input.bytes.length, width: 1, height: 1 });
    const bytes = new Uint8Array([1, 2, 3]);
    const request = async (uploads: ReturnType<typeof createUploadCoordinator>) => {
      const grant = await uploads.request(account, conversation, { operationId: randomUUID(), filename: 'synthetic.png', kind: 'image', contentType: 'image/png', byteSize: bytes.length, intendedUse: { purpose: 'panel_image', shotId: 'shot', panelId: 'panel' } });
      const response = await fetch(grant.url, { method: 'PUT', body: bytes, headers: { 'Content-Type': 'image/png' }, signal: AbortSignal.timeout(2000) }); await response.body?.cancel(); assert.equal(response.status, 200); return grant;
    };
    const effects = async () => (await setup.query(`SELECT (SELECT count(*)::int FROM artifacts.versions) AS versions,
      (SELECT count(*)::int FROM artifacts.conversation_uses) AS uses,(SELECT count(*)::int FROM artifacts.media_objects) AS pointers,
      (SELECT count(*)::int FROM artifacts.uploads WHERE confirmed_result IS NOT NULL) AS results,
      (SELECT revision::int FROM artifacts.publication_counters WHERE owner_id=$1) AS publication`, [account])).rows;

    await t.test('manual Save and verified completion use one owner-first lock order without deadlock or partial publication', async () => {
      let stored!: () => void, resume!: () => void, counterHeld!: () => void;
      const published = new Promise<void>(resolve => { stored = resolve; }), publishGate = new Promise<void>(resolve => { resume = resolve; });
      const atCounter = new Promise<void>(resolve => { counterHeld = resolve; });
      const sqlErrors: string[] = [], pending: Promise<unknown>[] = [];
      const observedPool = (source: Pool, pauseCounter: boolean) => new Proxy(source, { get(target, property) {
        if (property === 'connect') return async () => {
          const client = await target.connect();
          return new Proxy(client, { get(connection, key) {
            if (key === 'query') return async (sql: string, values?: unknown[]) => {
              try {
                const result = await connection.query(sql, values);
                if (pauseCounter && sql.startsWith('INSERT INTO artifacts.publication_counters') && sql.includes('RETURNING revision::text')) {
                  counterHeld(); await connection.query('SELECT pg_advisory_xact_lock(72413)');
                }
                return result;
              } catch (error) { if (error && typeof error === 'object' && 'code' in error) sqlErrors.push(String(error.code)); throw error; }
            };
            const value: unknown = Reflect.get(connection, key); return typeof value === 'function' ? value.bind(connection) : value;
          } }) as PoolClient;
        };
        const value: unknown = Reflect.get(target, property); return typeof value === 'function' ? value.bind(target) : value;
      } });
      const uploads = createUploadCoordinator(observedPool(pool, false), owned, { storage: { ...objects, publish: async (...args) => { const result = await objects.publish(...args); stored(); await publishGate; return result; } }, verifyMedia: inspect });
      const gate = await setup.connect();
      try {
        await gate.query('SELECT pg_advisory_lock(72413)');
        const grant = await request(uploads), completion = uploads.confirm(account, grant.uploadId, randomUUID()); pending.push(completion);
        await Promise.race([published, completion]);
        const manual = createArtifactWriters(observedPool(manualPool, true), owned).human.save(account, conversation, { operationId: randomUUID(), artifactId: board.artifactId, baseVersionId: board.id, kind: 'storyboard', content: { ...plan, shots: [{ ...plan.shots[0]!, intent: 'The traveller leaves.' }] }, dependencies: [script.id], intendedUse: { purpose: 'storyboard' } }); pending.push(manual);
        const outcomes = Promise.allSettled([manual, completion]);
        await Promise.race([atCounter, manual]); resume();
        let blocked = false; const deadline = Date.now() + 1500;
        while (!blocked && Date.now() < deadline) {
          blocked = (await manualPool.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='upload-owner-order' AND state='active' AND wait_event_type='Lock' AND query LIKE '%publication_counters%') AS blocked")).rows[0]?.blocked === true;
          if (!blocked) await setImmediate();
        }
        assert.ok(blocked, 'Actual completion must contend on the manual writer owner counter');
        await gate.query('SELECT pg_advisory_unlock(72413)');
        const [saved, completed] = await outcomes;
        assert.deepEqual(sqlErrors, [], 'No deadlock or timeout/retry may substitute for correct lock ordering');
        assert.equal(saved!.status, 'fulfilled', 'The admitted manual Save must finish');
        assert.equal(completed!.status, 'rejected');
        if (completed!.status === 'rejected') assert.equal((completed!.reason as { code?: string }).code, 'stale_revision');
        assert.deepEqual(await effects(), [{ versions: 3, uses: 1, pointers: 0, results: 0, publication: 3 }]);
        assert.deepEqual((await setup.query('SELECT count(*)::int AS refs,count(protected_version_id)::int AS protected FROM artifacts.upload_objects WHERE upload_id=$1', [grant.uploadId])).rows, [{ refs: 2, protected: 0 }]);
      } finally { resume(); await gate.query('SELECT pg_advisory_unlock_all()'); await Promise.allSettled(pending); gate.release(); }
    });

    for (const mode of ['expired', 'replaced'] as const) await t.test(`final completion rejects ${mode} leases after real reserved storage publication`, async () => {
      let stored!: () => void, resume!: () => void, first = true;
      const published = new Promise<void>(resolve => { stored = resolve; }), gate = new Promise<void>(resolve => { resume = resolve; });
      const uploads = createUploadCoordinator(pool, owned, { storage: { ...objects, publish: async (...args) => { const result = await objects.publish(...args); if (first) { first = false; stored(); await gate; } return result; } }, verifyMedia: async input => ({ ...await inspect(input), poster: { bytes: new Uint8Array([4, 5, 6]), contentType: 'image/png' } }) });
      const grant = await request(uploads), before = await effects(), completion = uploads.confirm(account, grant.uploadId, randomUUID());
      const outcome = Promise.allSettled([completion]);
      try {
        await Promise.race([published, completion]);
        assert.deepEqual((await setup.query('SELECT attempt_count FROM artifacts.uploads WHERE upload_id=$1', [grant.uploadId])).rows, [{ attempt_count: 1 }], 'Reservation completed before the real write was held');
        await setup.query("UPDATE artifacts.uploads SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE upload_id=$1", [grant.uploadId]);
        if (mode === 'replaced') await setup.query("UPDATE artifacts.uploads SET lease_token=$2,lease_expires_at=clock_timestamp()+interval '60 seconds' WHERE upload_id=$1", [grant.uploadId, randomUUID()]);
        const newer = (await setup.query('SELECT state,lease_token,lease_expires_at,confirmed_result FROM artifacts.uploads WHERE upload_id=$1', [grant.uploadId])).rows;
        resume(); const [result] = await outcome; assert.equal(result!.status, 'rejected');
        if (result!.status === 'rejected') assert.equal((result!.reason as { code?: string }).code, 'integration_failure');
        assert.deepEqual(await effects(), before, 'No late version, use, private pointer, command result or counter increment');
        const after = (await setup.query('SELECT state,lease_token,lease_expires_at,confirmed_result FROM artifacts.uploads WHERE upload_id=$1', [grant.uploadId])).rows;
        if (mode === 'replaced') assert.deepEqual(after, newer, 'The older worker cannot change or release a newer lease');
        else assert.deepEqual(after, [{ state: 'pending', lease_token: null, lease_expires_at: null, confirmed_result: null }]);
        const refs = (await setup.query<{ object_key: string; purpose: string; protected_version_id: string | null }>('SELECT object_key,purpose,protected_version_id FROM artifacts.upload_objects WHERE owner_id=$1 AND upload_id=$2 ORDER BY purpose', [account, grant.uploadId])).rows;
        assert.equal(refs.length, 3); assert.ok(refs.every(ref => ref.protected_version_id === null));
        for (const ref of refs) assert.equal((await objects.read(ref.object_key)).byteSize, 3, 'Actual late candidate/poster bytes and staging remain referenced for cleanup');
      } finally { resume(); await outcome; }
    });
  } finally { objects.close(); await native.close(); await manualPool.end(); await pool.end(); await setup.end(); }
});
