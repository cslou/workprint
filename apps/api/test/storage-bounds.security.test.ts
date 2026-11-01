import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer, type RequestListener } from 'node:http';
import { test } from 'node:test';
import { createPrivateObjectStorage } from '../src/storage/index.js';

/** A controlled broken HTTP peer proves transport deadlines, not a successful S3 service. */
async function brokenStorage(handler: RequestListener, timeoutMs: number) {
  const server = createServer(handler);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const storage = createPrivateObjectStorage({ endpoint: `http://127.0.0.1:${address.port}`, bucket: 'owned-fault-fixture', region: 'us-east-1', credentials: { accessKeyId: randomBytes(12).toString('hex'), secretAccessKey: randomBytes(32).toString('hex') } }, { timeoutMs });
  return { storage, close: async () => { storage.close(); server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); } };
}

test('S3 header deadline and concurrency cap settle without an unbounded pending queue', { timeout: 5000 }, async () => {
  let entered = 0, ready!: () => void;
  const received = new Promise<void>(resolve => { ready = resolve; });
  const fixture = await brokenStorage(() => { if (++entered === 2) ready(); }, 500);
  try {
    const first = fixture.storage.read('staging/one'), second = fixture.storage.read('staging/two');
    const completed = Promise.allSettled([first, second]);
    await received;
    await assert.rejects(fixture.storage.read('staging/three'), { code: 'unavailable', source: 'capacity' });
    const results = await completed;
    assert.ok(results.every(result => result.status === 'rejected' && result.reason instanceof Error && 'code' in result.reason && result.reason.code === 'unavailable'));
    assert.equal(entered, 2, 'The excess request is not queued or sent');
  } finally { await fixture.close(); }
});

test('S3 deadline includes a stalled body after successful headers', { timeout: 5000 }, async () => {
  const fixture = await brokenStorage((request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': '5', ETag: '"owned-body"' });
    if (request.method === 'HEAD') response.end(); else response.write(new Uint8Array([1]));
  }, 300);
  try { await assert.rejects(fixture.storage.read('staging/stalled'), { code: 'unavailable' }); }
  finally { await fixture.close(); }
});
