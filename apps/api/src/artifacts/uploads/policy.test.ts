import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseUploadRequest } from './policy.js';
import { createPrivateObjectStorage } from '../../storage/index.js';

const VIDEO = 100 * 1024 ** 2, IMAGE = 10 * 1024 ** 2;
const image = { operationId: 'size-control', kind: 'image' as const, filename: 'synthetic.png', contentType: 'image/png', byteSize: IMAGE };

test('upload policy refuses video and admits images up to 10 MiB', () => {
  assert.throws(() => parseUploadRequest('owned-conversation', { ...image, kind: 'video', filename: 'synthetic.mp4', contentType: 'video/mp4', byteSize: 1024 }), { code: 'unsupported' });
  assert.equal(parseUploadRequest('owned-conversation', image).byteSize, IMAGE);
  assert.throws(() => parseUploadRequest('owned-conversation', { ...image, byteSize: IMAGE + 1 }), { code: 'unsupported' });
});

test('storage signs uploads up to 100 MiB and refuses larger objects', async () => {
  const storage = createPrivateObjectStorage({ endpoint: 'http://127.0.0.1:1', bucket: 'owned-size-control', region: 'us-east-1', credentials: { accessKeyId: 'owned-synthetic-key', secretAccessKey: 'owned-synthetic-secret' } });
  const issuedAt = new Date(), expiresAt = new Date(issuedAt.getTime() + 60000);
  try {
    assert.ok(await storage.presignPut({ key: 'staging/size-control', byteSize: VIDEO, contentType: 'video/mp4', issuedAt, expiresAt }));
    await assert.rejects(storage.presignPut({ key: 'staging/size-control', byteSize: VIDEO + 1, contentType: 'video/mp4', issuedAt, expiresAt }), { code: 'invalid_object' });
  } finally { storage.close(); }
});
