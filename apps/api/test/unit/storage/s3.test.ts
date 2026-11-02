import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer, type RequestListener } from 'node:http';
import { test } from 'node:test';
import { createPrivateObjectStorage } from '../../../src/storage/index.js';

/** A controlled broken HTTP peer proves transport deadlines, not a successful S3 service. */
async function brokenStorage(handler: RequestListener, timeoutMs: number, concurrency?: number) {
  const server = createServer(handler);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const storage = createPrivateObjectStorage({ endpoint: `http://127.0.0.1:${address.port}`, bucket: 'owned-fault-fixture', region: 'us-east-1', credentials: { accessKeyId: randomBytes(12).toString('hex'), secretAccessKey: randomBytes(32).toString('hex') } }, { timeoutMs, ...(concurrency ? { concurrency } : {}) });
  return { storage, close: async () => { storage.close(); server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); } };
}

test('past the concurrency cap an operation waits its turn, for at most two deadlines', { timeout: 5000 }, async () => {
  let entered = 0, ready!: () => void;
  const received = new Promise<void>(resolve => { ready = resolve; });
  const fixture = await brokenStorage(() => { if (++entered === 2) ready(); }, 500);
  try {
    const first = fixture.storage.read('staging/one'), second = fixture.storage.read('staging/two');
    const third = fixture.storage.read('staging/three');
    await received;
    assert.equal(entered, 2, 'The third waits instead of being sent');
    // The first two time out (500 ms); the third then takes a slot and is sent.
    const results = await Promise.allSettled([first, second, third]);
    assert.ok(results.every(result => result.status === 'rejected' && result.reason instanceof Error && 'code' in result.reason && result.reason.code === 'unavailable'));
    assert.equal(entered, 3, 'The waiting operation ran once a slot was free');
  } finally { await fixture.close(); }
});

test('a wait longer than two deadlines, or a close, refuses as capacity', { timeout: 5000 }, async () => {
  const sent: string[] = [];
  const fixture = await brokenStorage(request => { sent.push(request.url ?? ''); }, 300, 1);
  try {
    // One slot of 300 ms each: the fourth can't start before 900 ms, past its 600 ms wait.
    const ahead = Promise.allSettled(['one', 'two', 'three'].map(key => fixture.storage.read(`staging/${key}`)));
    await assert.rejects(fixture.storage.read('staging/four'), { code: 'unavailable', source: 'capacity' });
    await ahead;
    assert.ok(!sent.some(url => url.includes('four')), 'The fourth was never sent');
    const blocking = Promise.allSettled([fixture.storage.read('staging/five')]);
    const queued = fixture.storage.read('staging/six');
    fixture.storage.close();
    await assert.rejects(queued, { code: 'unavailable', source: 'capacity' });
    await blocking;
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
