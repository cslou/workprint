import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { join } from 'node:path';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { buildServerComposition } from './built-server.js';
import { environment, root } from './environment.js';
import { start, unusedPort } from './process.js';

test('pre-Mastra hook rejects an unfinished upload before any body read', { timeout: 60000 }, async (t) => {
  const fixture = await environment();
  t.diagnostic(`Evidence: ${fixture.logs}`);
  const entry = await buildServerComposition(fixture.logs, 'ordering', (directory) => `
    import { createBackend } from ${JSON.stringify(join(directory, 'mastra/backend.js'))};
    export const mastra = await createBackend();
    export const beforeMastra = [async (c, next) => c.req.path === '/__entry-ordering'
      ? c.json({ bodyUsed: c.req.raw.bodyUsed }, 418) : next()];
  `, fixture.env);
  const target = await launch(entry, fixture, 'ordering');
  t.after(target.server.stop);
  const started = Date.now();
  const unfinished = request(`${target.origin}/__entry-ordering`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
  const watchdog = setTimeout(() => unfinished.destroy(new Error('Hook did not run within one second')), 1000);
  try {
    const response = new Promise<{ status: number | undefined; body: string }>((resolve, reject) => {
      unfinished.once('error', reject);
      unfinished.once('response', (incoming) => {
        let body = '';
        incoming.setEncoding('utf8');
        incoming.on('data', (chunk: string) => { body += chunk; });
        incoming.once('error', reject);
        incoming.once('end', () => resolve({ status: incoming.statusCode, body }));
      });
    });
    unfinished.write('{"unfinished":');
    const result = await response;
    assert.equal(result.status, 418);
    assert.deepEqual(JSON.parse(result.body), { bodyUsed: false });
    assert.equal(unfinished.writableEnded, false);
    assert.ok(Date.now() - started < 1000);
  } finally { clearTimeout(watchdog); unfinished.destroy(); }
  await target.server.stop();
  await fixture.noNetwork();
});

test('app-owned entry does not register generated browser-stream endpoints', { timeout: 60000 }, async (t) => {
  const fixture = await environment();
  t.diagnostic(`Evidence: ${fixture.logs}`);
  const entry = await buildServerComposition(fixture.logs, 'exposure', (directory) => `
    import { createBackend } from ${JSON.stringify(join(directory, 'mastra/backend.js'))};
    export const mastra = await createBackend();
  `, fixture.env);
  const target = await launch(entry, fixture, 'exposure');
  t.after(target.server.stop);
  for (const path of ['/api/agents/unregistered/browser/session', '/api/agents/unregistered/browser/stream']) {
    const response = await fetch(`${target.origin}${path}`, { signal: AbortSignal.timeout(2000) });
    assert.equal(response.status, 404, path);
    assert.deepEqual(await response.json(), { error: { code: 'not_found', message: 'Not found' } });
  }
  await target.server.stop();
  await fixture.noNetwork();
});

type Fixture = Awaited<ReturnType<typeof environment>>;
async function launch(entry: string, fixture: Fixture, name: string, extra: NodeJS.ProcessEnv = {}) {
  const file = process.env.WORKPRINT_AUTH_FIXTURE;
  assert.ok(file, 'Real loopback Auth fixture is required');
  const config = JSON.parse(await readFile(file, 'utf8')) as {
    url: string; anonKey: string; servingUrl: string; accounts: { email: string; password: string }[];
  };
  for (const url of [config.url, config.servingUrl]) assert.equal(new URL(url).hostname, '127.0.0.1');
  assert.ok(config.accounts.every((account) => /@[^@]+\.invalid$/.test(account.email)));
  const token = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: config.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(config.accounts[0]), signal: AbortSignal.timeout(3000),
  });
  assert.equal(token.status, 200);
  const identity = await token.json() as { access_token: string };
  const port = await unusedPort();
  const origin = `http://127.0.0.1:${port}`;
  const server = await start(process.execPath, [entry], {
    cwd: root, env: { ...fixture.env, DATABASE_URL: config.servingUrl, SUPABASE_URL: config.url,
      SUPABASE_PUBLISHABLE_KEY: config.anonKey, PORT: String(port), ...extra }, log: join(fixture.logs, `${name}.log`),
  });
  await server.response(`${origin}/health`);
  return { server, origin, headers: { Authorization: `Bearer ${identity.access_token}` } };
}

test('built entry preserves HTTP, worker, recovery and signal lifecycle', { timeout: 180000 }, async (t) => {
  const fixture = await environment();
  t.diagnostic(`Evidence: ${fixture.logs}`);
  const journal = join(fixture.logs, 'lifecycle.jsonl');
  const events = async () => (await readFile(journal, 'utf8')).trim().split('\n').filter(Boolean).map((line) => JSON.parse(line) as { event: string; pid: number; time: number });
  const waitFor = async (event: string) => {
    const deadline = Date.now() + 5000;
    for (;;) {
      const observed = (await events()).find((row) => row.event === event);
      if (observed) return observed;
      if (Date.now() > deadline) throw new Error(`Lifecycle event missing: ${event}`);
      await delay(20);
    }
  };
  const entry = await buildServerComposition(fixture.logs, 'lifecycle', (directory) => `
    import { appendFileSync } from 'node:fs';
    import { setTimeout as delay } from 'node:timers/promises';
    import { registerApiRoute } from '@mastra/core/server';
    import { createBackend } from ${JSON.stringify(join(directory, 'mastra/backend.js'))};
    const record = event => appendFileSync(${JSON.stringify(journal)}, JSON.stringify({ event, pid: process.pid, time: Date.now() }) + '\\n');
    export const mastra = await createBackend([
      registerApiRoute('/__entry/error', { method: 'GET', handler: () => { throw new Error('Synthetic entry failure'); } }),
      registerApiRoute('/__entry/slow', { method: 'GET', handler: async c => { record('request-started'); await delay(600); return c.json({ completed: true }); } }),
    ]);
    mastra.setServerMiddleware([async (c, next) => {
      if (c.req.path === '/__entry/error') throw new Error('Synthetic entry failure');
      return next();
    }]);
    const workers = mastra.startWorkers.bind(mastra);
    mastra.startWorkers = async () => { await workers(); record('workers-started'); };
    mastra.recoveryConfig.durableAgents = 'auto';
    mastra.restartAllActiveWorkflowRuns = async () => { record('workflow-recovery'); await delay(400); record('workflow-failure'); throw new Error('Synthetic startup recovery failure'); };
    const durable = mastra.recoverAllDurableAgents.bind(mastra);
    mastra.recoverAllDurableAgents = async () => { record('durable-recovery'); return durable(); };
    const shutdown = mastra.shutdown.bind(mastra);
    mastra.shutdown = async options => { record('core-shutdown'); if (process.env.ENTRY_STALL_SHUTDOWN === '1') await new Promise(() => {}); return shutdown(options); };
  `, fixture.env);
  const begin = async (name: string, extra: NodeJS.ProcessEnv = {}) => {
    await writeFile(journal, '');
    const target = await launch(entry, fixture, name, extra);
    t.after(target.server.stop);
    await waitFor('workers-started');
    await waitFor('workflow-failure');
    return target;
  };
  const signal = async (name: string, value: NodeJS.Signals) => process.kill((await waitFor(name)).pid, value);
  const exitWithin = async (server: Awaited<ReturnType<typeof start>>, ms: number) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([server.exited, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Server exit deadline')), ms); })]); }
    finally { clearTimeout(timer); }
  };
  await t.test('health, JSON errors/404, workers and concurrent nonfatal recovery', async () => {
    const target = await begin('http');
    assert.deepEqual(await (await fetch(`${target.origin}/health`)).json(), { success: true });
    for (const [path, status, body] of [
      ['/__entry/error', 500, { error: 'Internal Server Error' }],
      ['/not-registered', 404, { error: { code: 'not_found', message: 'Not found' } }],
    ] as const) {
      const response = await fetch(`${target.origin}${path}`, { headers: target.headers, signal: AbortSignal.timeout(2000) });
      assert.equal(response.status, status);
      assert.deepEqual(await response.json(), body);
    }
    const observed = await events();
    for (const event of ['workers-started', 'workflow-recovery', 'durable-recovery']) assert.equal(observed.filter((row) => row.event === event).length, 1);
    assert.ok((await waitFor('durable-recovery')).time < (await waitFor('workflow-failure')).time, 'Recoveries run concurrently');
    assert.match(await readFile(join(fixture.logs, 'http.log'), 'utf8'), /Failed to restart active workflow runs during server startup/);
    await signal('workers-started', 'SIGTERM');
    assert.equal(await exitWithin(target.server, 3000), 0);
  });
  await t.test('SIGTERM drains an in-flight request and refuses new connections', async () => {
    const target = await begin('drain');
    const pending = fetch(`${target.origin}/__entry/slow`, { headers: target.headers, signal: AbortSignal.timeout(7000) });
    await waitFor('request-started');
    const started = Date.now();
    await signal('workers-started', 'SIGTERM');
    await delay(100);
    await assert.rejects(fetch(`${target.origin}/health`, { headers: { Connection: 'close' }, signal: AbortSignal.timeout(1000) }));
    assert.deepEqual(await (await pending).json(), { completed: true });
    assert.equal(await exitWithin(target.server, 6000), 0);
    assert.ok(Date.now() - started < 5000);
  });
  const stalled = async (name: string) => {
    const target = await begin(name);
    const upload = request(`${target.origin}/v1/conversations/c/versions`, { method: 'POST', headers: { ...target.headers, 'Content-Type': 'application/json' } });
    const closed = new Promise<void>((resolve) => { upload.once('error', () => {}); upload.once('close', resolve); });
    upload.write('{"unfinished":');
    await new Promise<void>((resolve) => upload.once('socket', (socket) => { if (socket.connecting) socket.once('connect', resolve); else resolve(); }));
    // The server has accepted this upload before shutdown; the client never ends it.
    await delay(100);
    t.after(() => { upload.destroy(); });
    return { ...target, upload, closed };
  };
  await t.test('stalled upload is server-closed at the five-second drain bound', async () => {
    const target = await stalled('stalled');
    const started = Date.now();
    await signal('workers-started', 'SIGTERM');
    assert.equal(await exitWithin(target.server, 7000), 0);
    await target.closed;
    assert.equal(target.upload.writableEnded, false);
    assert.ok(Date.now() - started >= 4800 && Date.now() - started < 6500);
    assert.match(await readFile(join(fixture.logs, 'stalled.log'), 'utf8'), /drain timed out; closing remaining HTTP connections/);
  });
  await t.test('duplicate signal inside 250 ms is ignored', async () => {
    const target = await stalled('duplicate-early');
    await signal('workers-started', 'SIGTERM');
    await delay(50);
    await signal('workers-started', 'SIGINT');
    assert.equal(await exitWithin(target.server, 7000), 0);
  });
  await t.test('later duplicate signal exits one', async () => {
    const target = await stalled('duplicate-late');
    await signal('workers-started', 'SIGINT');
    await delay(350);
    await signal('workers-started', 'SIGTERM');
    assert.equal(await exitWithin(target.server, 2000), 1);
  });
  await t.test('core shutdown is bounded at drain plus five seconds', async () => {
    const target = await begin('core-stall', { ENTRY_STALL_SHUTDOWN: '1' });
    const started = Date.now();
    await signal('workers-started', 'SIGTERM');
    assert.equal(await exitWithin(target.server, 12000), 0);
    assert.ok(Date.now() - started >= 9800 && Date.now() - started < 11500);
    assert.match(await readFile(join(fixture.logs, 'core-stall.log'), 'utf8'), /Mastra shutdown timed out; forcing exit/);
  });
  await fixture.noNetwork();
});
