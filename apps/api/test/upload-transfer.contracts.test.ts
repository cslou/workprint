import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { transferUpload } from '@workprint/api-client';

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
