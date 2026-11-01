import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { developmentR2Configuration, R2QualificationBlocked, R2_DEVELOPMENT_FILE } from './r2-development.js';
import { storageTarget } from './object-storage.js';

const valid = { endpoint: `https://${'a'.repeat(32)}.r2.cloudflarestorage.com`, bucket: 'workprint-dev', accessKeyId: 'contract-access-key-id', secretAccessKey: 'contract-secret-access-key' };
const blockedWithout = (secret: string) => (error: unknown) => error instanceof R2QualificationBlocked && error.message.startsWith('NON-PASS: real-R2 qualification is blocked') && !error.message.includes(secret);

test('real-R2 qualification is blocked, never skipped, without an ignored valid development file; errors never echo values', async () => {
  assert.equal(R2_DEVELOPMENT_FILE, 'outputs/r2-development.json');
  assert.equal(storageTarget({}), 'emulator', 'The emulator stays the default target');
  assert.equal(storageTarget({ WORKPRINT_STORAGE_TARGET: 'r2' }), 'r2');
  assert.throws(() => storageTarget({ WORKPRINT_STORAGE_TARGET: 'R2-prod' }), /Unknown storage target/);

  await assert.rejects(developmentR2Configuration(`outputs/missing-${randomUUID()}.json`), blockedWithout(valid.secretAccessKey));
  // Tracked or outside-repository files are refused even when well formed.
  const outside = await mkdtemp(join(tmpdir(), 'workprint-r2-contract-'));
  try {
    await writeFile(join(outside, 'r2.json'), JSON.stringify(valid), { mode: 0o600 });
    await assert.rejects(developmentR2Configuration(join(outside, 'r2.json')), blockedWithout(valid.secretAccessKey));
  } finally { await rm(outside, { recursive: true }); }

  const ignored = `outputs/r2-contract-${randomUUID()}.json`;
  try {
    for (const value of [
      { ...valid, endpoint: 'https://example.com' },
      { ...valid, endpoint: 'http://127.0.0.1:9000' },
      { ...valid, endpoint: `${valid.endpoint}/workprint-dev` },
      { ...valid, bucket: 'Not_A_Bucket' },
      { ...valid, extra: 'value' },
      { endpoint: valid.endpoint, bucket: valid.bucket, accessKeyId: valid.accessKeyId },
    ]) {
      await writeFile(ignored, JSON.stringify(value), { mode: 0o600 });
      await assert.rejects(developmentR2Configuration(ignored), blockedWithout(valid.secretAccessKey));
    }
    await writeFile(ignored, `{"secretAccessKey":"${valid.secretAccessKey}"`, { mode: 0o600 });
    await assert.rejects(developmentR2Configuration(ignored), blockedWithout(valid.secretAccessKey), 'Malformed JSON never echoes content');
    await writeFile(ignored, JSON.stringify(valid), { mode: 0o600 });
    assert.deepEqual(await developmentR2Configuration(ignored), { endpoint: valid.endpoint, bucket: valid.bucket, credentials: { accessKeyId: valid.accessKeyId, secretAccessKey: valid.secretAccessKey } });
  } finally { await rm(ignored, { force: true }); }
});
