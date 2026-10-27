import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { cp, mkdir, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createClient } from '@supabase/supabase-js';
import { createConversationClient, type ConversationChunk, type ConversationClient } from '@workprint/api-client';
import { environment, root } from './environment.js';
import { localSupabase } from './local-supabase.js';
import { publish, waitFile } from './native-runtime/controlled-model.js';
import { isolatedPostgres } from './postgres.js';
import { command, start, unusedPort } from './process.js';

async function observe(client: ConversationClient, threadId: string) {
  const subscription = await client.subscribe(threadId);
  const chunks: ConversationChunk[] = [];
  const events = new EventEmitter();
  let closed = false;
  let failure: unknown;
  const done = subscription.processDataStream({ reconnect: false, onChunk: (chunk) => { chunks.push(chunk); events.emit('chunk'); } }).catch((error: unknown) => {
    if (!closed) { failure = error; events.emit('chunk'); }
  });
  return {
    chunks,
    async wait(predicate: (chunk: ConversationChunk) => boolean) {
      const signal = AbortSignal.timeout(10000);
      return new Promise<ConversationChunk>((resolve, reject) => {
        const close = () => { events.off('chunk', check); signal.removeEventListener('abort', abort); };
        const abort = () => { close(); reject(new Error('Native chunk deadline exceeded')); };
        function check() {
          const found = chunks.find(predicate);
          if (found) { close(); resolve(found); }
          else if (failure) { close(); reject(new Error('Native subscription failed; private details withheld')); }
        }
        events.on('chunk', check); signal.addEventListener('abort', abort, { once: true }); check();
      });
    },
    async close() { closed = true; subscription.unsubscribe(); await done; },
  };
}

async function savedHistory(client: ConversationClient, threadId: string, count: number) {
  const deadline = Date.now() + 5000;
  for (;;) {
    const history = await client.history(threadId);
    if (history.messages.length >= count) return history;
    if (Date.now() > deadline) throw new Error('Native durable history deadline exceeded');
    await delay(25); // Observe actual persistence, not infer it from a streamed finish.
  }
}
function signalId(response: { signal?: unknown }): string {
  const signal = response.signal;
  assert.ok(signal && typeof signal === 'object' && 'id' in signal && typeof signal.id === 'string', 'Native admission exposes its actual signal identity');
  return signal.id;
}
function messageIdentities(messages: unknown[]) {
  return messages.map((message) => {
    assert.ok(message && typeof message === 'object' && 'id' in message && typeof message.id === 'string' && 'role' in message && typeof message.role === 'string', 'Native saved message exposes identity and role');
    return { id: message.id, role: message.role };
  });
}
function runId(chunk: ConversationChunk): string {
  assert.ok('runId' in chunk && typeof chunk.runId === 'string' && chunk.runId);
  return chunk.runId;
}
function text(chunk: ConversationChunk) {
  return chunk.type === 'text-delta' ? chunk.payload.text : '';
}

test('built native HTTP streams, queues and reconnects without resend; Stop fences exact runs and preserves honest outcomes', { timeout: 240000 }, async (t) => {
  const local = await localSupabase();
  const fixture = await environment();
  const control = join(fixture.logs, 'barriers');
  await mkdir(control);
  const checkout = join(fixture.logs, 'qualified');
  const api = join(checkout, 'apps/api');
  await mkdir(api, { recursive: true });
  for (const file of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json']) await cp(join(root, file), join(checkout, file));
  for (const file of ['package.json', 'tsconfig.json', 'tsconfig.build.json', 'src']) await cp(join(root, 'apps/api', file), join(api, file), { recursive: true });
  await cp(join(root, 'apps/api/test/native-runtime'), join(api, 'test/native-runtime'), { recursive: true });
  await mkdir(join(checkout, 'apps/web'), { recursive: true });
  await cp(join(root, 'apps/web/package.json'), join(checkout, 'apps/web/package.json'));
  await cp(join(root, 'packages/api-client'), join(checkout, 'packages/api-client'), { recursive: true, filter: (path) => !path.includes('/node_modules') && !path.includes('/dist') });
  await command('pnpm', ['install', '--frozen-lockfile', '--offline'], { cwd: checkout, env: { PATH: process.env.PATH, HOME: process.env.HOME }, log: join(fixture.logs, 'install.log') });
  await command('pnpm', ['exec', 'mastra', 'build', '--dir', 'test/native-runtime'], { cwd: api, env: fixture.env, log: join(fixture.logs, 'qualified-build.log') });
  const auth = createClient(local.url, local.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await auth.auth.signInWithPassword(local.accounts[0]!);
  assert.ok(!signed.error && signed.data.user && signed.data.session, 'Actual Supabase identity required');
  const identity = { id: signed.data.user.id, token: signed.data.session.access_token };
  const db = await isolatedPostgres();
  const observers: Awaited<ReturnType<typeof observe>>[] = [];
  try {
    await command('pnpm', ['db:prepare'], { cwd: root, env: { ...fixture.env, MIGRATION_DATABASE_URL: db.setupUrl }, log: join(fixture.logs, 'prepare.log') });
    await db.grantServing();
    const port = await unusedPort();
    const origin = `http://127.0.0.1:${port}`;
    const log = join(fixture.logs, 'server.log');
    const server = await start(process.execPath, [join(api, '.mastra/output/index.mjs')], {
      cwd: checkout, env: { ...fixture.env, DATABASE_URL: db.servingUrl, PORT: String(port), SUPABASE_URL: local.url, SUPABASE_SECRET_KEY: local.secretKey, QUALIFICATION_DIRECTORY: control }, log,
    });
    try {
      await server.response(`${origin}/health`);
      const client = createConversationClient({ baseUrl: origin, resourceId: identity.id, getToken: async () => identity.token });
      const thread = await client.create('Native controlled stream');
      const firstObserver = await observe(client, thread.id); observers.push(firstObserver);
      await firstObserver.wait((chunk) => chunk.type === 'thread-history');
      const first = await client.send(thread.id, 'first controlled input');
      await waitFile(join(control, 'call-1.json'));
      const firstDelta = await firstObserver.wait((chunk) => chunk.type === 'text-delta');
      const firstRun = runId(firstDelta);
      assert.ok(first.runId === firstRun && text(firstDelta) === 'controlled-output-1');
      const queued = await client.queue(thread.id, 'second controlled input');
      assert.notEqual(signalId(first), signalId(queued), 'Native input identities remain distinct');
      await firstObserver.close();
      const reconnected = await observe(client, thread.id); observers.push(reconnected);
      await reconnected.wait((chunk) => chunk.type === 'text-delta' && runId(chunk) === firstRun);
      assert.equal((await readdir(control)).filter((name) => /^call-\d+\.json$/.test(name)).length, 1, 'Reconnect only observes, without resending or starting provider work');
      await publish(join(control, 'release-1'), 'release');
      await reconnected.wait((chunk) => chunk.type === 'finish' && runId(chunk) === firstRun);
      const secondCall = JSON.parse(await waitFile(join(control, 'call-2.json'))) as { inputs: string[] };
      assert.equal(secondCall.inputs.filter((input) => input === 'second controlled input').length, 1, 'Queued input enters the native prompt exactly once');
      const secondDelta = await reconnected.wait((chunk) => chunk.type === 'text-delta' && runId(chunk) !== firstRun);
      const secondRun = runId(secondDelta);
      assert.ok(secondRun !== firstRun && text(secondDelta) === 'controlled-output-2');
      assert.equal((await client.stop(thread.id, firstRun)).aborted, false, 'Delayed old Stop cannot affect the newer active turn');
      await publish(join(control, 'release-2'), 'release');
      await reconnected.wait((chunk) => chunk.type === 'finish' && runId(chunk) === secondRun);
      const saved = await savedHistory(client, thread.id, 4);
      const savedIdentities = messageIdentities(saved.messages);
      assert.deepEqual(savedIdentities.map((message) => message.role), ['signal', 'assistant', 'signal', 'assistant']);
      assert.ok(savedIdentities[0]?.id === signalId(first) && savedIdentities[2]?.id === signalId(queued), 'Saved history preserves native input identities/order without duplication');
      const third = await client.send(thread.id, 'interrupt controlled input');
      await waitFile(join(control, 'call-3.json'));
      const thirdDelta = await reconnected.wait((chunk) => chunk.type === 'text-delta' && runId(chunk) === third.runId);
      assert.equal(text(thirdDelta), 'controlled-output-3');
      assert.equal((await client.stop(thread.id, third.runId)).aborted, true, 'Stop names the exact active turn');
      await reconnected.wait((chunk) => chunk.type === 'abort' && runId(chunk) === third.runId);
      assert.ok(!reconnected.chunks.some((chunk) => chunk.type === 'finish' && runId(chunk) === third.runId), 'Interrupted stream is not reported as completed');
      const afterAbort = await savedHistory(client, thread.id, 6);
      assert.ok(messageIdentities(afterAbort.messages)[4]?.id === signalId(third), 'Interrupted input is durably retained under its native identity');
      assert.equal((await readdir(control)).filter((name) => /^call-\d+\.json$/.test(name)).length, 3, 'Exactly three controlled calls, no optional inference or resend');
      assert.ok(!(await readdir(control)).includes('unexpected-generate'));
      t.diagnostic(`Observed native chunks: ${[...new Set(reconnected.chunks.map((chunk) => chunk.type))].sort().join(',')}; saved roles: ${messageIdentities(afterAbort.messages).map((message) => message.role).join(',')}`);
    } finally {
      for (const observer of observers) await observer.close();
      await server.stop();
    }
    const captured = await readFile(log, 'utf8');
    for (const value of [local.url, local.secretKey, identity.token, ...local.accounts.flatMap((account) => [account.email, account.password])]) assert.ok(!captured.includes(value), 'Private local configuration must not enter native logs');
  } finally { await db.close(); }
  await fixture.noNetwork();
  t.diagnostic(`Native stream evidence: ${fixture.logs}`);
});
