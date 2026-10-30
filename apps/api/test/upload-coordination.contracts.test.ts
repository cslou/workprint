import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Pool } from 'pg';
import { createApiClient } from '@workprint/api-client';
import { verifyBuiltAdmission } from './auth-built-fixture.js';
import { createNativeConversation } from './native-conversations.js';
import { isolatedObjectStorage } from './object-storage.js';
import { query } from './postgres.js';
import { PutObjectCommand } from '@aws-sdk/client-s3';

test('built owned upload grants reconcile identity and real bytes but cannot publish without media verification', { timeout: 240000 }, async t => {
  const storage = await isolatedObjectStorage(undefined, message => t.diagnostic(message)); t.after(storage.close);
  let conversation = '', setupUrl = '';
  let expectedUploads = 1, expectedConfirmations = 1;
  await verifyBuiltAdmission(t, async target => {
    const client = createApiClient({ baseUrl: target.origin, getAccessToken: async () => target.accessTokens[0]! });
    const foreign = createApiClient({ baseUrl: target.origin, getAccessToken: async () => target.accessTokens[1]! });
    const bytes = new TextEncoder().encode('synthetic unverified media');
    const input = { params: { id: conversation }, query: {}, body: { operationId: randomUUID(), kind: 'image' as const, filename: 'fixture.png', contentType: 'image/png', byteSize: bytes.length, intendedUse: { purpose: 'reference' as const } } };
    const first = await client.requestUpload(input);
    assert.ok(first.ok, 'A configured owned private upload must issue a grant instead of 501');
    assert.ok(first.value.url.startsWith(storage.endpoint + '/'), 'Only the owned local storage target is used');
    const replay = await client.requestUpload(input); assert.ok(replay.ok); assert.ok(replay.value.uploadId === first.value.uploadId && replay.value.url === first.value.url && replay.value.expiresAt === first.value.expiresAt, 'Retry retains exact identity, key, signing time and expiry');
    const collision = await client.requestUpload({ ...input, body: { ...input.body, filename: 'changed.png' } }); assert.ok(!collision.ok); assert.equal(collision.error.code, 'invalid_input');
    const denied = await foreign.requestUpload(input); assert.ok(!denied.ok); assert.equal(denied.error.code, 'not_found');
    const put = await fetch(first.value.url, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: bytes, signal: AbortSignal.timeout(3000) }); assert.equal(put.status, 200); await put.body?.cancel();
    const command = { params: { id: first.value.uploadId }, query: {}, body: { operationId: randomUUID() } };
    for (let attempt = 0; attempt < 2; attempt++) {
      const confirmed = await client.confirmUpload(command); assert.ok(!confirmed.ok); assert.equal(confirmed.error.code, 'not_implemented'); assert.equal(confirmed.error.message, 'Media verification is not available');
    }
    const foreignConfirm = await foreign.confirmUpload(command); assert.ok(!foreignConfirm.ok); assert.equal(foreignConfirm.error.code, 'not_found');
    const library = await client.library({ params: {}, query: {}, body: {} }); assert.ok(library.ok); assert.equal(library.value.items.length, 0, 'Grant and successful PUT never become usable work');
    for (const body of [{ ...input.body, operationId: randomUUID(), contentType: 'image/svg+xml' }, { ...input.body, operationId: randomUUID(), byteSize: 10 * 1024 * 1024 + 1 }]) {
      const rejected = await client.requestUpload({ ...input, body }); assert.ok(!rejected.ok); assert.equal(rejected.error.code, 'unsupported');
    }
    const wrongTarget = await client.requestUpload({ ...input, body: { ...input.body, operationId: randomUUID(), intendedUse: { purpose: 'panel_image', shotId: 'absent-shot', panelId: 'absent-panel' } } }); assert.ok(!wrongTarget.ok); assert.equal(wrongTarget.error.code, 'not_found');
    const lostInput = { ...input, body: { ...input.body, operationId: randomUUID() } };
    const actualFetch = globalThis.fetch;
    const lostResponse = t.mock.method(globalThis, 'fetch', async (...args: Parameters<typeof fetch>) => {
      const response = await actualFetch(...args); assert.equal(response.status, 201); await response.arrayBuffer(); throw new TypeError('Owned grant-response loss after commit');
    });
    try { const lost = await client.requestUpload(lostInput); assert.ok(!lost.ok); assert.equal(lost.error.code, 'transport_failure'); }
    finally { lostResponse.mock.restore(); }
    const recovered = await client.requestUpload(lostInput); assert.ok(recovered.ok); expectedUploads++;
    const reusedConfirm = await client.confirmUpload({ ...command, params: { id: recovered.value.uploadId } }); assert.ok(!reusedConfirm.ok); assert.equal(reusedConfirm.error.code, 'invalid_input');
    const mismatch = await client.requestUpload({ ...input, body: { ...input.body, operationId: randomUUID() } }); assert.ok(mismatch.ok); expectedUploads++;
    const key = new URL(mismatch.value.url).pathname.slice(storage.bucket.length + 2);
    await storage.client.send(new PutObjectCommand({ Bucket: storage.bucket, Key: key, Body: bytes.subarray(1), ContentLength: bytes.length - 1, ContentType: 'image/png' }));
    const mismatchedCommand = { params: { id: mismatch.value.uploadId }, query: {}, body: { operationId: randomUUID() } };
    let bad = await client.confirmUpload(mismatchedCommand); assert.ok(!bad.ok); assert.equal(bad.error.code, 'invalid_input'); expectedConfirmations++;
    await storage.client.send(new PutObjectCommand({ Bucket: storage.bucket, Key: key, Body: bytes, ContentLength: bytes.length, ContentType: 'video/mp4' }));
    bad = await client.confirmUpload(mismatchedCommand); assert.ok(!bad.ok); assert.equal(bad.error.code, 'invalid_input');
    await storage.client.send(new PutObjectCommand({ Bucket: storage.bucket, Key: key, Body: bytes, ContentLength: bytes.length, ContentType: 'image/png' }));
    bad = await client.confirmUpload(mismatchedCommand); assert.ok(!bad.ok); assert.equal(bad.error.code, 'not_implemented', 'Matching headers/size are still not media verification');
    const missing = await client.requestUpload({ ...input, body: { ...input.body, operationId: randomUUID() } }); assert.ok(missing.ok); expectedUploads++;
    const absent = await client.confirmUpload({ params: { id: missing.value.uploadId }, query: {}, body: { operationId: randomUUID() } }); assert.ok(!absent.ok); assert.equal(absent.error.code, 'not_found'); expectedConfirmations++;
    const expiresInput = { ...input, body: { ...input.body, operationId: randomUUID() } };
    const expires = await client.requestUpload(expiresInput); assert.ok(expires.ok); expectedUploads++;
    const clock = new Pool({ connectionString: setupUrl, max: 1 });
    try { await clock.query("UPDATE artifacts.uploads SET issued_at=statement_timestamp()-interval '6 minutes',expires_at=statement_timestamp()-interval '1 minute' WHERE upload_id=$1", [expires.value.uploadId]); }
    finally { await clock.end(); }
    const expiredGrant = await client.requestUpload(expiresInput); assert.ok(!expiredGrant.ok); assert.equal(expiredGrant.error.code, 'not_found');
    const expiredConfirm = await client.confirmUpload({ params: { id: expires.value.uploadId }, query: {}, body: { operationId: randomUUID() } }); assert.ok(!expiredConfirm.ok); assert.equal(expiredConfirm.error.code, 'not_found');
  }, {
    storage: { endpoint: storage.endpoint, bucket: storage.bucket, region: 'us-east-1', credentials: storage.credentials },
    prepareSavedWork: async setup => { assert.ok(setup.setupUrl); setupUrl = setup.setupUrl; conversation = (await createNativeConversation(setup.native, setup.accountIds[0]!)).id; },
    verifySavedEffects: async url => {
      assert.deepEqual((await query(url, 'SELECT (SELECT count(*)::int FROM artifacts.versions) AS versions,(SELECT count(*)::int FROM artifacts.conversation_uses) AS uses')).rows, [{ versions: 0, uses: 0 }]);
      assert.deepEqual((await query(url, 'SELECT (SELECT count(*)::int FROM artifacts.uploads) AS uploads,(SELECT count(*)::int FROM artifacts.upload_objects) AS objects,(SELECT count(*)::int FROM artifacts.upload_confirmations) AS confirmations')).rows, [{ uploads: expectedUploads, objects: expectedUploads, confirmations: expectedConfirmations }]);
    },
  });
});
