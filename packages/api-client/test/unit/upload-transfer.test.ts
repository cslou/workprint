import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { transferUpload } from '../../src/index.js';

/** Controlled broken transfer peer; successful private transport is separately proved on S3. */
test('private browser transport bounds initiation, concurrency, deadline and cancellation without retries', { timeout: 10000 }, async () => {
  let requests = 0, ready!: () => void;
  const entered = new Promise<void>(resolve => { ready = resolve; });
  const server = createServer(() => { requests++; if (requests === 2) ready(); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const grant = { uploadId: 'owned-fault-control', url: `http://127.0.0.1:${address.port}/staging/fault?X-Amz-Signature=owned-fault-control`, expiresAt: new Date(Date.now() + 60000).toISOString(), maxBytes: 3 };
  const file = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
  try {
    const oversized = await transferUpload({ ...grant, maxBytes: 2 }, file); assert.ok(!oversized.ok); assert.equal(oversized.error.code, 'invalid_input');
    const unsupported = await transferUpload(grant, new Blob(['x'], { type: 'image/svg+xml' })); assert.ok(!unsupported.ok); assert.equal(unsupported.error.code, 'invalid_input');
    const expired = await transferUpload({ ...grant, expiresAt: new Date(0).toISOString() }, file); assert.ok(!expired.ok); assert.equal(expired.error.code, 'not_found');
    const controller = new AbortController(); controller.abort(); const cancelled = await transferUpload(grant, file, { signal: controller.signal }); assert.ok(!cancelled.ok); assert.equal(cancelled.error.code, 'cancelled');
    assert.equal(requests, 0);
    const first = transferUpload(grant, file, { timeoutMs: 300 }), second = transferUpload(grant, file, { timeoutMs: 300 });
    await entered;
    const capacity = await transferUpload(grant, file); assert.ok(!capacity.ok); assert.equal(capacity.error.code, 'integration_failure');
    const outcomes = await Promise.all([first, second]); assert.ok(outcomes.every(result => !result.ok && result.error.code === 'timed_out')); assert.equal(requests, 2, 'No queue or implicit retry');
  } finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});

test('the 100 MiB transport ceiling admits exactly its limit without credentials, and one byte over sends nothing', { timeout: 15000 }, async () => {
  const limit = 100 * 1024 ** 2;
  let requests = 0, received = 0;
  const server = createServer(async (request, response) => {
    requests++;
    assert.equal(request.headers.authorization, undefined); assert.equal(request.headers.cookie, undefined);
    for await (const chunk of request) received += (chunk as Buffer).length;
    response.writeHead(200); response.end();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const grant = { uploadId: 'size-boundary', url: `http://127.0.0.1:${address.port}/staging/boundary?X-Amz-Signature=local-control`, expiresAt: new Date(Date.now() + 60000).toISOString(), maxBytes: limit };
  const file = new Blob([Buffer.alloc(limit)], { type: 'video/mp4' });
  try {
    const over = await transferUpload({ ...grant, maxBytes: limit + 1 }, new Blob([file, new Uint8Array([0])], { type: 'video/mp4' }));
    assert.ok(!over.ok); assert.equal(over.error.code, 'invalid_input'); assert.equal(requests, 0);
    const exact = await transferUpload(grant, file);
    assert.ok(exact.ok); assert.equal(received, limit); assert.equal(requests, 1);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
