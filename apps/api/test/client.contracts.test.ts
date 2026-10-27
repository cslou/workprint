import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createApiClient } from '@workprint/api-client';
import { applicationRequests } from './application-requests.js';

test('client bounds transport, headers/body stalls, cancellation and invalid responses; native unavailable never fetches', { timeout: 10000 }, async (t) => {
  let requests = 0;
  const server = createServer((req, res) => {
    requests++;
    if (req.url?.startsWith('/v1/library')) {
      if (req.headers.authorization === 'Bearer body-stall') { res.writeHead(200); res.flushHeaders(); }
      else if (req.headers.authorization === 'Bearer malformed') { res.writeHead(501); res.end('{'); }
      else if (req.headers.authorization === 'Bearer invalid') { res.writeHead(200); res.end('{"privateRow":true}'); }
      else if (req.headers.authorization === 'Bearer oversized') { res.writeHead(200); res.end('x'.repeat(1024 * 1024 + 1)); }
      else if (req.headers.authorization === 'Bearer redirect') { res.writeHead(302, { Location: '/other' }); res.end(); }
      // Otherwise deliberately stall before headers.
    } else { res.end('unexpected'); }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const client = (token: string) => createApiClient({ baseUrl, getAccessToken: async () => token, timeoutMs: 100 });
  for (const token of ['stall', 'body-stall']) {
    const before = Date.now();
    const result = await client(token).library(applicationRequests.library);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, 'timed_out');
    assert.ok(Date.now() - before < 1000);
  }
  for (const token of ['malformed', 'invalid', 'oversized']) {
    const result = await client(token).library(applicationRequests.library);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, 'invalid_response');
  }
  const redirected = await client('redirect').library(applicationRequests.library);
  assert.equal(redirected.ok, false);
  if (!redirected.ok) assert.equal(redirected.error.code, 'transport_failure');
  const controller = new AbortController();
  const cancelled = client('stall').library(applicationRequests.library, { signal: controller.signal });
  controller.abort();
  const result = await cancelled;
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, 'cancelled');
  const stalledIdentity = createApiClient({ baseUrl, timeoutMs: 100, getAccessToken: () => new Promise(() => {}) });
  const identityResult = await stalledIdentity.library(applicationRequests.library);
  assert.equal(identityResult.ok, false);
  if (!identityResult.ok) assert.equal(identityResult.error.code, 'timed_out');
  const beforeNative = requests;
  for (const method of Object.values(client('unused').native)) {
    const unavailable = await method();
    assert.equal(unavailable.ok, false);
    if (!unavailable.ok) assert.equal(unavailable.error.code, 'not_implemented');
  }
  assert.equal(requests, beforeNative);
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  const disconnected = await client('unused').library(applicationRequests.library);
  assert.equal(disconnected.ok, false);
  if (!disconnected.ok) assert.equal(disconnected.error.code, 'transport_failure');
});
