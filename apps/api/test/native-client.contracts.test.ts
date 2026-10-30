import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createApiClient } from '@workprint/api-client';

const resourceId = '11111111-1111-4111-8111-111111111111';
test('native transport validates failures, response bounds and prompt cancellation without retries', async t => {
  let count = 0, mode = 'unavailable';
  const server = createServer((_request, response) => {
    count++; response.setHeader('Content-Type', 'application/json');
    if (mode === 'oversized') { response.end(JSON.stringify({ value: 'x'.repeat(1024 * 1024) })); return; }
    if (mode === 'malformed') { response.end('{'); return; }
    if (mode === 'held') { response.writeHead(200); response.write('{'); return; }
    response.writeHead(503); response.end(JSON.stringify({ error: { code: mode === 'mismatch' ? 'invalid_input' : 'integration_failure', message: 'Native service unavailable' } }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const native = createApiClient({ baseUrl, getAccessToken: async () => 'synthetic-test-only-bearer', timeoutMs: 1000 }).native;
  await t.test('SDK reads consume one actual failure and never retry', async () => {
    const before = count; const result = await native.listConversations({ resourceId, page: 0, perPage: 6 });
    assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, 'integration_failure'); assert.equal(count - before, 1);
  });
  for (const failure of ['mismatch', 'oversized', 'malformed']) await t.test(`${failure} response cannot become a definite create rejection`, async () => {
    mode = failure; const before = count;
    const result = await native.createConversation({ resourceId }); assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, 'invalid_response'); assert.equal(count - before, 1);
  });
  await t.test('a suspended response body reaches its deadline once without retry', async () => {
    mode = 'held'; const before = count; const start = performance.now();
    const client = createApiClient({ baseUrl, getAccessToken: async () => 'synthetic-test-only-bearer', timeoutMs: 100 });
    const result = await client.native.listConversations({ resourceId, page: 0, perPage: 6 });
    assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, 'timed_out');
    assert.ok(performance.now() - start < 1500); assert.equal(count - before, 1);
  });
  await t.test('caller cancellation settles while token acquisition is still suspended', async () => {
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
    const controller = new AbortController(); const before = count;
    const client = createApiClient({ baseUrl, timeoutMs: 1000, getAccessToken: async () => { await gate; return 'synthetic-test-only-bearer'; } });
    let settled = false; const work = client.native.createConversation({ resourceId }, { signal: controller.signal }).then(result => { settled = true; return result; });
    controller.abort();
    try {
      await new Promise(resolve => setTimeout(resolve, 100)); assert.equal(settled, true, 'Cancellation must not wait for token publication');
      const result = await work; assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, 'cancelled'); assert.equal(count, before);
    } finally { release(); await work; }
  });
});
