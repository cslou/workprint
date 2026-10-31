import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { join } from 'node:path';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { buildServerComposition } from './built-server.js';
import { environment } from './environment.js';
import { loadAuthFixture, signInFixtureAccount, startAuthServer } from './auth-server.js';

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

for (const prefix of ['/api', '/native']) {
  test(`completed /v1 bodies retain global timeout after programmatic middleware (${prefix})`, { timeout: 60000 }, async (t) => {
    const fixture = await environment();
    t.diagnostic(`Evidence: ${fixture.logs}`);
    const journal = join(fixture.logs, 'completed-bodies.jsonl');
    await writeFile(journal, '');
    const entry = await buildServerComposition(fixture.logs, 'timeout', (directory) => `
      import { appendFileSync } from 'node:fs';
      import { setTimeout as delay } from 'node:timers/promises';
      import { registerApiRoute } from '@mastra/core/server';
      import { createBackend } from ${JSON.stringify(join(directory, 'mastra/backend.js'))};
      export const mastra = await createBackend(['fast', 'slow'].map(kind => registerApiRoute('/v1/__entry-timeout/' + kind, {
        method: 'POST', handler: async c => {
          const body = await c.req.json();
          appendFileSync(${JSON.stringify(journal)}, JSON.stringify({ kind, body }) + '\\n');
          if (kind === 'slow') await delay(750);
          return c.json({ completed: true, body });
        }
      })));
      mastra.getServer().apiPrefix = ${JSON.stringify(prefix)};
      mastra.getServer().timeout = 300;
      mastra.setServerMiddleware([{ path: '*', handler: async (c, next) => {
        if (c.req.path.startsWith('/v1/__entry-timeout/')) await delay(450);
        await next();
        c.header('X-Programmatic-Middleware', 'retained');
        return c.res;
      } }]);
    `, fixture.env);
    const target = await launch(entry, fixture, 'timeout');
    t.after(target.server.stop);
    const body = { payload: 'complete' };
    for (const kind of ['fast', 'slow']) {
      const started = Date.now();
      const response = await fetch(`${target.origin}/v1/__entry-timeout/${kind}`, {
        method: 'POST', headers: { ...target.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(2500),
      });
      assert.equal(response.status, kind === 'slow' ? 504 : 200, `${kind} completed-body request`);
      assert.deepEqual(await response.json(), kind === 'slow' ? { error: 'Gateway Timeout' } : { completed: true, body });
      assert.equal(response.headers.get('X-Programmatic-Middleware'), 'retained');
      assert.ok(Date.now() - started >= 400, 'Existing programmatic middleware runs before the timeout');
      assert.ok(Date.now() - started < 2000, 'Server response precedes the independent client watchdog');
    }
    const observed = (await readFile(journal, 'utf8')).trim().split('\n').map(line => JSON.parse(line) as unknown);
    assert.deepEqual(observed, [{ kind: 'fast', body }, { kind: 'slow', body }], 'Completed bodies reach authenticated handlers before the downstream timeout');
    await target.server.stop();
    await fixture.noNetwork();
  });
}

type Fixture = Awaited<ReturnType<typeof environment>>;
async function launch(entry: string, fixture: Fixture, name: string, extra: NodeJS.ProcessEnv = {}) {
  const config = await loadAuthFixture();
  const identity = await signInFixtureAccount(config, config.accounts[0]!);
  const { server, origin } = await startAuthServer(entry, fixture.env, config, join(fixture.logs, `${name}.log`), { env: extra });
  return { server, origin, headers: { Authorization: `Bearer ${identity.access_token}` } };
}

test('built entry preserves HTTP, worker, recovery and signal lifecycle', { timeout: 180000 }, async (t) => {
  const fixture = await environment();
  t.diagnostic(`Evidence: ${fixture.logs}`);
  const journal = join(fixture.logs, 'lifecycle.jsonl');
  const events = async () => (await readFile(journal, 'utf8')).trim().split('\n').filter(Boolean).map((line) => JSON.parse(line) as { event: string; pid: number; time: number; drainTimeout?: number });
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
    const record = (event, extra = {}) => appendFileSync(${JSON.stringify(journal)}, JSON.stringify({ event, pid: process.pid, time: Date.now(), ...extra }) + '\\n');
    export const mastra = await createBackend([
      registerApiRoute('/__entry/error', { method: 'GET', handler: () => { throw new Error('Synthetic entry failure'); } }),
      registerApiRoute('/__entry/slow', { method: 'GET', handler: async c => { record('request-started'); await delay(600); return c.json({ completed: true }); } }),
      registerApiRoute('/__entry/stalled', { method: 'POST', handler: async () => { record('stalled-handler-started'); return new Promise(() => {}); } }),
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
    const beforeNativeShutdown = async () => { record('owned-native-shutdown'); if (process.env.ENTRY_FAIL_NATIVE_HOOK === '1') throw new Error('Controlled owned native shutdown failure'); if (process.env.ENTRY_STALL_NATIVE_HOOK === '1') await new Promise(() => {}); };
    const shutdown = mastra.shutdown.bind(mastra);
    mastra.shutdown = async options => { record('core-shutdown', options); const result = await shutdown(options); record('core-shutdown-complete'); if (process.env.ENTRY_FAIL_SHUTDOWN === '1') throw new Error('Controlled native shutdown failure'); if (process.env.ENTRY_STALL_SHUTDOWN === '1') await new Promise(() => {}); return result; };
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
  const exitWithin = async (server: Awaited<ReturnType<typeof launch>>['server'], ms: number) => {
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
  const stalled = async (name: string, extra: NodeJS.ProcessEnv = {}) => {
    const target = await begin(name, extra);
    const upload = request(`${target.origin}/__entry/stalled`, { method: 'POST', headers: { ...target.headers, 'Content-Type': 'application/json' } });
    const closed = new Promise<void>((resolve) => { upload.once('error', () => {}); upload.once('close', resolve); });
    upload.end('{}');
    await waitFor('stalled-handler-started');
    // Hold downstream work after completed-body admission; intake itself is now bounded.
    t.after(() => { upload.destroy(); });
    return { ...target, upload, closed };
  };
  await t.test('stalled handler is server-closed within the two-second HTTP share', async () => {
    const target = await stalled('stalled');
    const started = Date.now();
    await signal('workers-started', 'SIGTERM');
    assert.equal(await exitWithin(target.server, 7000), 0);
    await target.closed;
    assert.equal(target.upload.writableEnded, true, 'The stalled work has a completed request body');
    assert.ok(Date.now() - started >= 1800 && Date.now() - started < 3500);
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
  await t.test('stalled native acknowledgment exits nonzero within the one total deadline', async () => {
    const target = await begin('core-stall', { ENTRY_STALL_SHUTDOWN: '1' });
    const started = Date.now();
    await signal('workers-started', 'SIGTERM');
    assert.equal(await exitWithin(target.server, 9000), 1);
    const elapsed = Date.now() - started;
    assert.ok(elapsed >= 6800 && elapsed < 8000);
    t.diagnostic(`Native stalled acknowledgment signal-to-exit ${elapsed} ms; exit 1`);
    assert.match(await readFile(join(fixture.logs, 'core-stall.log'), 'utf8'), /Total shutdown deadline exceeded/);
  });
  await t.test('one seven-second total deadline bounds held HTTP and a stalled native acknowledgment', async () => {
    const target = await stalled('total-stall', { ENTRY_STALL_SHUTDOWN: '1' });
    const started = Date.now();
    await signal('workers-started', 'SIGTERM');
    assert.equal(await exitWithin(target.server, 9000), 1, 'The server itself exits; the watchdog never kills it');
    await target.closed;
    const elapsed = Date.now() - started;
    assert.ok(elapsed >= 6800 && elapsed < 8000, `One total seven-second deadline: ${elapsed} ms`);
    const records = await events();
    const nativeStart = records.find(row => row.event === 'core-shutdown' && row.pid === records.find(event => event.event === 'workers-started')?.pid);
    assert.ok(nativeStart && nativeStart.time - started >= 1800 && nativeStart.time - started < 3000, 'HTTP receives at most its two-second share');
    assert.ok(nativeStart.drainTimeout! > 3500 && nativeStart.drainTimeout! <= 5000, 'Native drain receives only the remaining total budget');
    assert.ok(records.some(row => row.event === 'core-shutdown-complete'), 'Real native shutdown completes before its acknowledgment is withheld');
    t.diagnostic(`Combined HTTP/native stall signal-to-exit ${elapsed} ms; HTTP ${nativeStart.time - started} ms; native drain allowance ${nativeStart.drainTimeout} ms; exit 1`);
    assert.match(await readFile(join(fixture.logs, 'total-stall.log'), 'utf8'), /Total shutdown deadline exceeded/);
  });
  await t.test('native shutdown rejection is an honest nonzero exit', async () => {
    const target = await begin('core-error', { ENTRY_FAIL_SHUTDOWN: '1' });
    await signal('workers-started', 'SIGTERM');
    assert.equal(await exitWithin(target.server, 3000), 1);
    assert.match(await readFile(join(fixture.logs, 'core-error.log'), 'utf8'), /Error during Mastra shutdown/);
  });
  await t.test('owned native adapter failure still calls real Mastra shutdown and exits nonzero', async () => {
    const target = await begin('owned-error', { ENTRY_FAIL_NATIVE_HOOK: '1' });
    await signal('workers-started', 'SIGTERM');
    assert.equal(await exitWithin(target.server, 3000), 1);
    assert.ok((await events()).some(row => row.event === 'core-shutdown-complete'));
    assert.match(await readFile(join(fixture.logs, 'owned-error.log'), 'utf8'), /Error while settling owned native work/);
  });
  await t.test('a stalled owned native adapter also spends the same seven-second total budget', async () => {
    const target = await stalled('owned-stall', { ENTRY_STALL_NATIVE_HOOK: '1' });
    const started = Date.now();
    await signal('workers-started', 'SIGTERM');
    assert.equal(await exitWithin(target.server, 9000), 1);
    const elapsed = Date.now() - started;
    assert.ok(elapsed >= 6800 && elapsed < 8000);
    assert.match(await readFile(join(fixture.logs, 'owned-stall.log'), 'utf8'), /Total shutdown deadline exceeded/);
    t.diagnostic(`Owned adapter stall signal-to-exit ${elapsed} ms; exit 1`);
  });
  await fixture.noNetwork();
});
