import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import type { Version } from '@workprint/contracts';
import { createApiClient } from '../src/index.js';

const script = (action: string) => ({ schemaVersion: 1, scenes: [{ heading: { setting: 'interior', location: 'Station', time: 'morning' }, characters: ['Ada'], script: [{ action }] }] });

test('typed client accepts only the optional boolean builtIn presentation indicator from a real HTTP response', async () => {
  const version: Version & { builtIn: boolean } = { id: 'example-version', artifactId: 'example-artifact', kind: 'script', revision: 1, createdBy: 'human', createdAt: '2026-11-01T00:00:00Z', dependencies: [], content: script('Ada waits.'), builtIn: true };
  let payload: unknown = version, requests = 0;
  const server = createServer((_request, response) => { requests++; response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(payload)); });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  try {
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    const client = createApiClient({ baseUrl: `http://127.0.0.1:${address.port}`, getAccessToken: async () => null });
    const read = () => client.version({ params: { id: version.id }, query: {}, body: {} });
    const result = await read(); assert.ok(result.ok, 'The approved optional builtIn indicator must survive typed transport'); assert.deepEqual(result.value, version);
    payload = { ...version, builtIn: 'true' }; const invalid = await read(); assert.ok(!invalid.ok); assert.equal(invalid.error.code, 'invalid_response');
    const { builtIn, ...ordinary } = version; assert.equal(builtIn, true); payload = ordinary; const absent = await read(); assert.ok(absent.ok); assert.deepEqual(absent.value, ordinary);
    assert.equal(requests, 3);
  } finally { server.closeAllConnections(); await new Promise<void>((done, fail) => server.close(error => error ? fail(error) : done())); }
});
