import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer, request } from 'node:http';
import { join } from 'node:path';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { environment } from './environment.js';
import { buildServerComposition } from './built-server.js';
import { loadAuthFixture, signInFixtureAccount, startAuthServer } from './auth-server.js';

const limit = 1024 * 1024;
const browserOrigin = 'http://127.0.0.1:4179';
const errors = {
  400: { error: { code: 'invalid_input', message: 'Invalid application request' } },
  401: { error: { code: 'unauthenticated', message: 'Authentication required' } },
  404: { error: { code: 'not_found', message: 'Not found' } },
  503: { error: { code: 'integration_failure', message: 'Authentication unavailable' } },
};
type Resources = { ready: boolean; sockets: number; active: number; requestListeners: number; connectionListeners: number; closed: { name: string; data: number; dataNames: string[]; readable: number; destroyed: boolean; socketDestroyed: boolean; end: number; error: number; close: number }[] };

async function eventually<T>(read: () => Promise<T>, accepts: (value: T) => boolean, milliseconds = 1500): Promise<T> {
  const deadline = Date.now() + milliseconds;
  for (;;) {
    const value = await read();
    if (accepts(value)) return value;
    if (Date.now() > deadline) throw new Error('Server resource settlement deadline');
    await delay(20);
  }
}

test('built ingress bounds intake and preserves the trusted readable handoff', { timeout: 300000 }, async (t) => {
  const fixture = await environment();
  t.diagnostic(`Evidence: ${fixture.logs}`);
  const config = await loadAuthFixture();
  const resourcesFile = join(fixture.logs, 'resources.json');
  const effectsFile = join(fixture.logs, 'effects.jsonl');
  const entry = await buildServerComposition(fixture.logs, 'intake', directory => `
    import { createHash } from 'node:crypto';
    import { writeFileSync, appendFileSync } from 'node:fs';
    import { setTimeout as delay } from 'node:timers/promises';
    import { registerApiRoute } from '@mastra/core/server';
    import { createBackend } from ${JSON.stringify(join(directory, 'mastra/backend.js'))};
    writeFileSync(${JSON.stringify(effectsFile)}, '');
    export const mastra = await createBackend(['echo', 'slow', 'get'].map(kind => registerApiRoute('/__intake/' + kind, {
      method: kind === 'get' ? 'GET' : 'POST', handler: async c => {
        const bytes = new Uint8Array(await c.req.raw.arrayBuffer());
        appendFileSync(${JSON.stringify(effectsFile)}, JSON.stringify({ kind, name: c.req.header('X-Intake-Test') }) + '\\n');
        if (kind === 'slow') await delay(3000);
        return c.json({ accountId: c.get('requestContext').get('accountId'), hash: createHash('sha256').update(bytes).digest('hex'),
          length: bytes.length, method: c.req.method, path: new URL(c.req.url).pathname, query: new URL(c.req.url).search,
          marker: c.req.header('X-Intake-Marker'), contentType: c.req.header('Content-Type'), aborted: c.req.raw.signal.aborted });
      }
    })));
    export const beforeMastra = [async (c, next) => {
      await next();
      appendFileSync(${JSON.stringify(effectsFile)}, JSON.stringify({ kind: 'settled', name: c.req.header('X-Intake-Test') }) + '\\n');
    }];
    export function afterServer(server) {
      const active = new Set(), closed = [];
      let ready = false;
      server.on('request', (req, res) => {
        active.add(req);
        req.once('close', () => { active.delete(req); closed.push(req); });
      });
      // Only the startup readiness fetch is swept. Per-case cleanup must be production-owned.
      setTimeout(() => { server.closeIdleConnections(); ready = true; }, 800);
      setInterval(() => server.getConnections((error, sockets) => {
        if (error) throw error;
        writeFileSync(${JSON.stringify(resourcesFile)}, JSON.stringify({ ready, sockets, active: active.size, requestListeners: server.listenerCount('request'), connectionListeners: server.listenerCount('connection'),
          closed: closed.map(req => ({ name: req.headers['x-intake-test'], data: req.listenerCount('data'), dataNames: req.listeners('data').map(listener => listener.name),
            readable: req.listenerCount('readable'), destroyed: req.destroyed, socketDestroyed: req.socket.destroyed,
            end: req.listenerCount('end'), error: req.listenerCount('error'), close: req.listenerCount('close') })) }));
      }), 25).unref();
    }
  `, fixture.env);
  const identity = await signInFixtureAccount(config, config.accounts[0]!);
  let calls = 0;
  let successfulAuthCalls = 0;
  let stallAuth = false;
  let authGate: { arrived: () => void; wait: Promise<void> } | undefined;
  const authProxy = createServer(async (incoming, outgoing) => {
    calls++;
    if (stallAuth) return;
    const gate = authGate;
    if (gate) { gate.arrived(); await gate.wait; }
    try {
      const upstream = await fetch(`${config.url}/auth/v1/user`, {
        headers: { apikey: config.anonKey, Authorization: incoming.headers.authorization ?? '' }, signal: AbortSignal.timeout(3000), redirect: 'error',
      });
      outgoing.writeHead(upstream.status, { 'Content-Type': 'application/json' });
      const body = await upstream.text();
      if (upstream.status === 200) successfulAuthCalls++;
      outgoing.end(body);
    } catch { outgoing.writeHead(503); outgoing.end('{}'); }
  });
  await new Promise<void>(resolve => authProxy.listen(0, '127.0.0.1', resolve));
  t.after(() => { authProxy.closeAllConnections(); authProxy.close(); });
  const address = authProxy.address();
  assert.ok(address && typeof address !== 'string');
  const target = await startAuthServer(entry, fixture.env, config, join(fixture.logs, 'intake.log'), {
    env: { SUPABASE_URL: `http://127.0.0.1:${address.port}`, WORKPRINT_BROWSER_ORIGIN: browserOrigin },
  });
  t.after(target.server.stop);
  const resources = async () => {
    try { return JSON.parse(await readFile(resourcesFile, 'utf8')) as Resources; }
    catch { return { ready: false, sockets: -1, active: -1, requestListeners: -1, connectionListeners: -1, closed: [] }; }
  };
  const baselineResources = await eventually(resources, r => r.ready && r.sockets === 0 && r.active === 0, 5000);
  const effects = async () => (await readFile(effectsFile, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as { kind: string; name: string });
  type Input = { name: string; path?: string; method?: string; body?: string; headers?: Record<string, string>; auth?: boolean;
    declared?: number; unfinished?: boolean; splitDelay?: number; lateEnd?: boolean; status: number; cors?: boolean; downstream?: boolean };
  const begin = (input: Input) => {
    const started = Date.now();
    let responseSeen = false;
    let watchdogFired = false;
    const headers: Record<string, string> = { 'X-Intake-Test': input.name, 'X-Intake-Marker': 'original-header',
      ...(input.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(input.auth === false ? {} : { Authorization: `Bearer ${identity.access_token}` }), ...input.headers,
      ...(input.declared !== undefined ? { 'Content-Length': String(input.declared) } : {}) };
    const upload = request(`${target.origin}${input.path ?? '/__intake/echo'}`, { method: input.method ?? 'POST', headers, agent: false });
    const watchdog = setTimeout(() => { watchdogFired = true; upload.destroy(new Error('Independent client watchdog; no server result')); }, 5000);
    const response = new Promise<{ status: number | undefined; body: string; headers: Record<string, string | string[] | undefined>; elapsed: number }>((resolve, reject) => {
      upload.on('error', error => { if (!responseSeen) reject(error); });
      upload.once('response', incoming => {
        let body = '';
        incoming.setEncoding('utf8');
        incoming.on('data', (chunk: string) => { body += chunk; });
        incoming.once('error', reject);
        incoming.once('end', () => { responseSeen = true; resolve({ status: incoming.statusCode, body, headers: incoming.headers, elapsed: Date.now() - started }); });
      });
    });
    const body = input.body ?? '';
    let later: ReturnType<typeof setTimeout> | undefined;
    if (input.splitDelay || input.lateEnd) {
      const split = Math.max(1, Math.floor(body.length / 2));
      upload.write(body.slice(0, split));
      later = setTimeout(() => { upload.end(body.slice(split)); }, input.lateEnd ? 2600 : input.splitDelay);
    } else if (input.unfinished) upload.write(body);
    else upload.end(input.body);
    return { upload, response, watchdogFired: () => watchdogFired, cleanup: () => { clearTimeout(watchdog); clearTimeout(later); upload.destroy(); } };
  };
  const check = async (input: Input, pending?: ReturnType<typeof begin>) => {
    const running = pending ?? begin(input);
    try {
      const response = await running.response;
      assert.equal(response.status, input.status, input.name);
      assert.ok(response.elapsed < (input.downstream ? 4500 : 3500), 'Server responds before client watchdog');
      if (input.unfinished && !input.lateEnd) assert.equal(running.upload.writableEnded, false, 'Rejected before client completed upload');
      if (input.status in errors) assert.deepEqual(JSON.parse(response.body), errors[input.status as keyof typeof errors]);
      if (input.status === 200 && input.path === '/health') assert.deepEqual(JSON.parse(response.body), { success: true });
      else if (input.status === 200) {
        const result = JSON.parse(response.body) as Record<string, unknown>;
        assert.deepEqual(result, { accountId: identity.user.id, hash: createHash('sha256').update(input.body ?? '').digest('hex'),
          length: Buffer.byteLength(input.body ?? ''), method: input.method ?? 'POST', path: (input.path ?? '/__intake/echo').split('?')[0],
          query: input.path?.includes('?') ? '?' + input.path.split('?')[1] : '', marker: 'original-header',
          contentType: input.headers?.['Content-Type'] ?? 'application/json', aborted: false });
      }
      if (input.cors) {
        assert.equal(response.headers['access-control-allow-origin'], browserOrigin);
        assert.equal(response.headers.vary, 'Origin');
      }
      const settled = await eventually(resources, r => r.sockets === 0 && r.active === 0 && r.closed.some(req => req.name === input.name && req.destroyed && req.socketDestroyed && req.data <= 1 && req.readable === 0));
      assert.equal(settled.requestListeners, baselineResources.requestListeners, 'Server request listeners return to baseline');
      assert.equal(settled.connectionListeners, baselineResources.connectionListeners, 'Server connection listeners return to baseline');
      const closed = settled.closed.find(req => req.name === input.name)!;
      assert.equal(closed.destroyed, true, 'Server request is destroyed, not merely client-timed-out');
      assert.equal(closed.socketDestroyed, true, 'Server transport is closed');
      // Node retains its inert onData adapter listener on a destroyed IncomingMessage.
      assert.ok(closed.data <= 1, 'No additional live body data listeners remain');
      if (closed.data) assert.deepEqual(closed.dataNames, ['onData']);
      assert.equal(closed.readable, 0, 'No server body read subscriptions remain');
      assert.equal(running.watchdogFired(), false, 'Resource release precedes any client watchdog/destruction');
      if (input.lateEnd) {
        await delay(1000);
        assert.equal((await effects()).filter(effect => effect.name === input.name && effect.kind !== 'settled').length, 0, 'No handler/effect after late completion attempt');
      }
      return response;
    } finally { running.cleanup(); }
  };
  const exact = '{"payload":"' + 'x'.repeat(limit - Buffer.byteLength('{"payload":""}')) + '"}';
  assert.equal(Buffer.byteLength(exact), limit);
  const cases: Input[] = [
    { name: 'ordinary public health GET', path: '/health', method: 'GET', auth: false, status: 200 },
    { name: 'ordinary catalog GET', path: '/__intake/get', method: 'GET', headers: { 'Content-Type': 'application/json' }, status: 200 },
    { name: 'unauthenticated catalog body GET', path: '/__intake/get', method: 'GET', body: '{', declared: 10, unfinished: true, auth: false, status: 401 },
    { name: 'unknown unfinished', path: '/not-registered', body: '{', unfinished: true, auth: false, status: 404 },
    { name: 'unauthenticated unfinished', body: '{', unfinished: true, auth: false, status: 401 },
    { name: 'authenticated stalled', body: '{', unfinished: true, status: 400 },
    { name: 'declared exact limit', body: exact, declared: limit, status: 200 },
    { name: 'declared limit plus one', body: '{', declared: limit + 1, unfinished: true, status: 400 },
    { name: 'chunked exact limit', body: exact, splitDelay: 20, status: 200 },
    { name: 'chunked limit plus one', body: exact + ' ', unfinished: true, status: 400 },
    { name: 'slow complete', body: '{"payload":"slow"}', splitDelay: 650, status: 200 },
    { name: 'wrong content type', body: '{}', headers: { 'Content-Type': 'text/plain' }, status: 400 },
    { name: 'malformed JSON', body: '{', status: 400 },
    { name: 'early 401 CORS', body: '{', unfinished: true, auth: false, headers: { Origin: browserOrigin }, cors: true, status: 401 },
    { name: 'early 400 CORS', body: '{', unfinished: true, headers: { Origin: browserOrigin }, cors: true, status: 400 },
    { name: 'late completion', body: '{"payload":"late"}', unfinished: true, lateEnd: true, status: 400 },
    { name: 'three second handler', path: '/__intake/slow', body: '{"payload":"downstream"}', downstream: true, status: 200 },
  ];
  await t.test('allowed preflight stays public and narrow', async () => {
    const before = calls;
    await check({ name: 'preflight', method: 'OPTIONS', auth: false, status: 204,
      headers: { Origin: browserOrigin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' }, cors: true });
    assert.equal(calls, before);
  });
  for (const input of cases) await t.test(input.name, async () => { await check(input); });
  await t.test('single real Auth call and exact identity/body/metadata survive native cloning', async () => {
    const before = calls;
    await check({ name: 'trusted handoff', path: '/__intake/echo?exact=original', body: '{"requestContext":{"accountId":"forged"},"payload":"unaltered"}', status: 200 });
    assert.equal(calls - before, 1, 'One online verification, never a second post-Mastra verification');
  });
  await t.test('Auth outage rejects an unfinished body with 503', async () => {
    stallAuth = true;
    try { await check({ name: 'Auth stalled unfinished', body: '{', unfinished: true, headers: { Origin: browserOrigin }, cors: true, status: 503 }); }
    finally { stallAuth = false; authProxy.closeAllConnections(); }
  });
  await t.test('disconnect during real Auth never dispatches the catalog GET', async () => {
    let reached!: () => void;
    let release!: () => void;
    const arrived = new Promise<void>(resolve => { reached = resolve; });
    const wait = new Promise<void>(resolve => { release = resolve; });
    authGate = { arrived: reached, wait };
    const beforeSuccessful = successfulAuthCalls;
    const input: Input = { name: 'disconnected during Auth', path: '/__intake/get', method: 'GET', status: 200 };
    const pending = begin(input);
    const response = pending.response.catch(() => undefined);
    try {
      await Promise.race([arrived, delay(1500).then(() => { throw new Error('Auth gate arrival deadline'); })]);
      pending.upload.destroy();
      await eventually(resources, r => r.sockets === 0);
      authGate = undefined;
      release();
      const journal = await eventually(effects, rows => rows.some(row => row.name === input.name && row.kind === 'settled'));
      assert.equal(successfulAuthCalls - beforeSuccessful, 1, 'Held verification completed against real Supabase successfully');
      assert.equal(await response, undefined, 'The peer disconnected before any server response');
      assert.equal(journal.filter(row => row.name === input.name && row.kind !== 'settled').length, 0, 'Closed transport cannot dispatch after successful Auth');
      await eventually(resources, r => r.active === 0 && r.sockets === 0 && r.closed.some(req => req.name === input.name && req.destroyed && req.socketDestroyed && req.readable === 0));
      assert.equal(pending.watchdogFired(), false);
    } finally { authGate = undefined; release(); pending.cleanup(); }
  });
  await t.test('concurrent followups remain available while a body is stalled', async () => {
    const input: Input = { name: 'concurrent stall', body: '{', unfinished: true, status: 400 };
    const pending = begin(input);
    try {
      const responses = await Promise.all([
        fetch(`${target.origin}/health`, { headers: { Connection: 'close' }, signal: AbortSignal.timeout(1000) }),
        fetch(`${target.origin}/v1/library`, { headers: { Authorization: `Bearer ${identity.access_token}`, Connection: 'close' }, signal: AbortSignal.timeout(1500) }),
      ]);
      assert.equal(responses[0]!.status, 200);
      assert.deepEqual(await responses[0]!.json(), { success: true });
      assert.equal(responses[1]!.status, 501);
      assert.deepEqual(await responses[1]!.json(), { error: { code: 'not_implemented', message: 'This operation is not implemented' } });
      await check(input, pending);
    } finally { pending.cleanup(); }
  });
  const getCases: Input[] = [
    { name: 'health declared unfinished GET', path: '/health', method: 'GET', auth: false, body: '{', declared: 10, unfinished: true, status: 400 },
    { name: 'health chunked unfinished GET', path: '/health', method: 'GET', auth: false, body: '{', headers: { 'Transfer-Encoding': 'chunked' }, unfinished: true, status: 400 },
    { name: 'catalog declared unfinished GET', path: '/__intake/get', method: 'GET', body: '{', declared: 10, unfinished: true, status: 400 },
    { name: 'catalog chunked unfinished GET', path: '/__intake/get', method: 'GET', body: '{', headers: { 'Transfer-Encoding': 'chunked', Origin: browserOrigin }, cors: true, unfinished: true, status: 400 },
  ];
  for (const input of getCases) await t.test(input.name, async () => { await check(input); });
  await target.server.stop();
  await fixture.noNetwork();
});
