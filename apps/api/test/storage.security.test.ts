import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GetObjectCommand, GetBucketCorsCommand, HeadObjectCommand, PutObjectCommand, S3ServiceException } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { isolatedObjectStorage } from './object-storage.js';
import { createPrivateObjectStorage } from '../src/storage/index.js';

test('private digest-pinned S3 service enforces scoped signatures, CORS, expiry and immutable separate keys', { timeout: 180000 }, async t => {
  const storage = await isolatedObjectStorage(undefined, message => t.diagnostic(message));
  const { client, foreign, bucket, endpoint } = storage;
  const objects = createPrivateObjectStorage({ endpoint, bucket, region: 'us-east-1', credentials: storage.credentials }, { maxBytes: 64 });
  const bytes = Buffer.from('known synthetic storage bytes'), changed = Buffer.from('other synthetic storage bytes');
  assert.equal(bytes.length, changed.length);
  const staging = 'staging/qualified-transfer', published = 'published/known-immutable';
  const read = async (key: string, range?: string) => {
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key, ...(range ? { Range: range } : {}) }), { abortSignal: AbortSignal.timeout(2000) });
    assert.ok(result.Body); return { ...result, bytes: Buffer.from(await result.Body.transformToByteArray()) };
  };
  const denied = (status: number, name?: string) => (error: unknown) => {
    assert.ok(error instanceof S3ServiceException); assert.equal(error.$metadata.httpStatusCode, status); if (name) assert.equal(error.name, name); return true;
  };
  const put = async (url: string, body: Buffer, contentType = 'application/octet-stream') => {
    const response = await fetch(url, { method: 'PUT', body: new Uint8Array(body), headers: { 'content-type': contentType }, signal: AbortSignal.timeout(2000) });
    await response.body?.cancel(); return response.status;
  };
  try {
    const cors = await client.send(new GetBucketCorsCommand({ Bucket: bucket }));
    assert.deepEqual(cors.CORSRules?.[0]?.AllowedOrigins, ['http://127.0.0.1:4279', 'http://127.0.0.1:4280']);
    const url = await getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: staging, ContentLength: bytes.length, ContentType: 'application/octet-stream' }), { expiresIn: 3, signableHeaders: new Set(['content-length', 'content-type']) });
    assert.equal(new URL(url).searchParams.get('X-Amz-SignedHeaders'), 'content-length;content-type;host');
    for (const [origin, expected] of [['http://127.0.0.1:4279', 200], ['http://127.0.0.1:4278', 403]] as const) {
      const preflight = await fetch(url, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'content-type' }, signal: AbortSignal.timeout(2000) });
      assert.equal(preflight.status, expected); assert.equal(preflight.headers.get('access-control-allow-origin'), expected === 200 ? origin : null); await preflight.body?.cancel();
    }
    assert.equal(await put(url, Buffer.from('x')), 403, 'Actual length is signed, not merely advisory metadata');
    assert.equal(await put(url, bytes, 'image/png'), 403, 'Declared content type is signed');
    assert.equal(await put(url, bytes), 200);
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: published, Body: bytes, ContentType: 'application/octet-stream', IfNoneMatch: '*' }));
    await assert.rejects(client.send(new PutObjectCommand({ Bucket: bucket, Key: published, Body: changed, IfNoneMatch: '*' })), denied(412, 'PreconditionFailed'));
    assert.equal(await put(url, changed), 200, 'A presigned PUT is replayable before expiry, not single-use');
    assert.deepEqual((await read(staging)).bytes, changed); assert.deepEqual((await read(published)).bytes, bytes, 'Writable staging URL cannot alter a separate immutable object');
    const ranged = await read(published, 'bytes=1-4'); assert.equal(ranged.$metadata.httpStatusCode, 206); assert.equal(ranged.ContentRange, `bytes 1-4/${bytes.length}`); assert.deepEqual(ranged.bytes, bytes.subarray(1, 5));
    const unsigned = await fetch(`${endpoint}/${bucket}/${published}`, { signal: AbortSignal.timeout(2000) }); assert.equal(unsigned.status, 403); await unsigned.body?.cancel();
    await assert.rejects(foreign.send(new GetObjectCommand({ Bucket: bucket, Key: published })), denied(403, 'AccessDenied'));
    await assert.rejects(client.send(new HeadObjectCommand({ Bucket: bucket, Key: 'absent' })), denied(404, 'NotFound'));
    await assert.rejects(client.send(new GetObjectCommand({ Bucket: bucket, Key: 'absent' })), denied(404, 'NoSuchKey'));
    await new Promise(resolve => setTimeout(resolve, 4000)); assert.equal(await put(url, bytes), 403, 'Actual signature expiry is enforced by the service');
    assert.deepEqual((await read(published)).bytes, bytes);
    const snapshot = await objects.read(published); assert.deepEqual(snapshot.bytes, bytes); assert.equal(snapshot.byteSize, bytes.length); assert.equal(snapshot.sha256.length, 64);
    await assert.rejects(objects.read(published, 2), { code: 'invalid_object' });
    await assert.rejects(objects.read('published/missing'), { code: 'not_found' });
    const issuedAt = new Date(Math.floor(Date.now() / 1000) * 1000), expiresAt = new Date(issuedAt.getTime() + 5000);
    const grant = { key: 'staging/adapter-grant', byteSize: bytes.length, contentType: 'application/octet-stream', issuedAt, expiresAt };
    const authorized = await objects.presignPut(grant); assert.ok(authorized === await objects.presignPut(grant), 'Identical intent retains the original signing time/expiry');
    assert.equal(await put(authorized, bytes), 200); assert.deepEqual((await objects.read(grant.key)).bytes, bytes);
    await assert.rejects(objects.presignPut({ ...grant, key: published }), { code: 'invalid_object' });
    await assert.rejects(objects.presignPut({ ...grant, byteSize: 65 }), { code: 'invalid_object' });
    await objects.publish('published/adapter-snapshot', snapshot.bytes, snapshot.contentType);
    await assert.rejects(objects.publish('published/adapter-snapshot', changed, snapshot.contentType), { code: 'conflict' });
    assert.deepEqual((await objects.read('published/adapter-snapshot')).bytes, bytes);
    await objects.remove(grant.key); await assert.rejects(objects.read(grant.key), { code: 'not_found' });
    const readIssued = new Date(Math.floor(Date.now() / 1000) * 1000), readExpires = new Date(readIssued.getTime() + 1000);
    const readGrant = { key: published, issuedAt: readIssued, expiresAt: readExpires };
    await assert.rejects(objects.presignRead({ ...readGrant, key: staging }), { code: 'invalid_object' });
    await assert.rejects(objects.presignRead({ ...readGrant, expiresAt: new Date(readIssued.getTime() + 301000) }), { code: 'invalid_object' });
    const signedRead = await objects.presignRead(readGrant); assert.equal(signedRead, await objects.presignRead(readGrant));
    const actualRead = await fetch(signedRead, { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(2000) }); assert.equal(actualRead.status, 200); assert.deepEqual(Buffer.from(await actualRead.arrayBuffer()), bytes);
    await new Promise(resolve => setTimeout(resolve, 2200)); const expiredRead = await fetch(signedRead, { signal: AbortSignal.timeout(2000) }); assert.equal(expiredRead.status, 403); await expiredRead.body?.cancel();
  } finally { objects.close(); await storage.close(); }
});
