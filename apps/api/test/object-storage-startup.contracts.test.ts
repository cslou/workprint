import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CreateBucketCommand, DeleteObjectCommand, PutBucketCorsCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { initializeObjectStorage } from './object-storage-startup.js';

const phases = ['s3.create-bucket', 's3.configure-cors', 's3.readiness-write', 's3.readiness-delete'];
const input = { bucket: 'private-fixture-bucket', owner: 'private-fixture-owner', origins: ['https://fixture.invalid'] } as const;

test('isolated S3 startup preserves command order, CORS, readiness bytes, exact deadlines and single dispatch', async t => {
  const messages: string[] = [], deadlines: number[] = [], commands: unknown[] = [], signals: AbortSignal[] = [];
  const client = new S3Client({ region: 'us-east-1', maxAttempts: 1, credentials: { accessKeyId: 'not-a-real-key', secretAccessKey: 'not-a-real-secret' } }); t.after(() => client.destroy());
  t.mock.method(AbortSignal, 'timeout', (ms: number) => { deadlines.push(ms); return new AbortController().signal; });
  t.mock.method(client, 'send', async (command: unknown, options: { abortSignal: AbortSignal }) => { commands.push(command); signals.push(options.abortSignal); return {}; });
  await initializeObjectStorage(client, input, message => messages.push(message));
  assert.deepEqual(deadlines, [3000, 3000, 30000, 3000]); assert.equal(commands.length, 4); assert.equal(new Set(signals).size, 4);
  assert.ok(commands[0] instanceof CreateBucketCommand); assert.deepEqual(commands[0].input, { Bucket: input.bucket });
  assert.ok(commands[1] instanceof PutBucketCorsCommand); assert.deepEqual(commands[1].input.CORSConfiguration?.CORSRules?.[0], { AllowedOrigins: [...input.origins], AllowedMethods: ['PUT', 'GET', 'HEAD'], AllowedHeaders: ['content-type', 'content-length', 'x-amz-content-sha256'], ExposeHeaders: ['ETag', 'Content-Length', 'Content-Type', 'Content-Range', 'Accept-Ranges'], MaxAgeSeconds: 60 });
  assert.ok(commands[2] instanceof PutObjectCommand); assert.deepEqual(commands[2].input, { Bucket: input.bucket, Key: 'fixture-readiness/' + input.owner, Body: Buffer.from('storage ready'), ContentLength: 13, ContentType: 'application/octet-stream' });
  assert.ok(commands[3] instanceof DeleteObjectCommand); assert.deepEqual(commands[3].input, { Bucket: input.bucket, Key: 'fixture-readiness/' + input.owner });
  assert.deepEqual(messages.map(message => { const event = JSON.parse(message) as { phase: string; status: string }; return [event.phase, event.status]; }), phases.flatMap(phase => [[phase, 'start'], [phase, 'complete']]));
  for (const hidden of [input.bucket, input.owner, input.origins[0], 'storage ready', 'not-a-real-key', 'not-a-real-secret']) assert.ok(!messages.join('').includes(hidden));
});

for (const [index, phase] of phases.entries()) test('isolated S3 failure identifies ' + phase + ' without dispatching later operations or exposing its cause', async t => {
  const messages: string[] = []; let sends = 0;
  const cause = new DOMException('https://fixture.invalid/?token=not-real', 'TimeoutError'), failure = new Error('private-body', { cause }); failure.name = 'AbortError';
  const client = new S3Client({ region: 'us-east-1', maxAttempts: 1, credentials: { accessKeyId: 'not-a-real-key', secretAccessKey: 'not-a-real-secret' } }); t.after(() => client.destroy());
  t.mock.method(client, 'send', async () => { if (sends++ === index) throw failure; return {}; });
  await assert.rejects(initializeObjectStorage(client, input, message => messages.push(message)), error => error instanceof Error && error === failure && error.cause === cause);
  assert.equal(sends, index + 1);
  const events = messages.map(message => JSON.parse(message) as { phase: string; status: string; failure?: string });
  assert.deepEqual(events.map(event => [event.phase, event.status]), [...phases.slice(0, index).flatMap(previous => [[previous, 'start'], [previous, 'complete']]), [phase, 'start'], [phase, 'failed']]);
  assert.equal(events.at(-1)?.failure, 'aborted');
  for (const hidden of ['private-body', 'fixture.invalid', 'not-real', input.bucket, input.owner]) assert.ok(!messages.join('').includes(hidden));
});
