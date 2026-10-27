import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { createConversationClient } from '@workprint/api-client';
import { environment, root } from './environment.js';
import { localSupabase } from './local-supabase.js';
import { isolatedPostgres } from './postgres.js';
import { command, start, unusedPort } from './process.js';

// Never surface SDK error payloads containing private endpoint/account material.
async function owned<T>(operation: string, call: () => Promise<T>): Promise<T> {
  try { return await call(); } catch { throw new Error(`Authenticated native ${operation} failed; private SDK details withheld`); }
}
async function rejects(call: () => Promise<unknown>) {
  try { await call(); return false; } catch { return true; }
}

test('real Supabase identities own native create/list/load/history; foreign and unauthenticated calls are denied', { timeout: 180000 }, async (t) => {
  const local = await localSupabase();
  const fixture = await environment();
  const identities: { id: string; token: string; expiresAt: number }[] = [];
  for (const account of local.accounts) {
    const auth = createClient(local.url, local.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const signed = await auth.auth.signInWithPassword(account);
    assert.ok(!signed.error && signed.data.user && signed.data.session, 'Actual local sign-in succeeds');
    const verified = await auth.auth.getUser(signed.data.session.access_token);
    assert.ok(!verified.error && verified.data.user?.id === signed.data.user.id, 'Actual Supabase verifies the issued token');
    assert.ok(signed.data.session.expires_at, 'Actual issued session supplies an expiry');
    identities.push({ id: signed.data.user.id, token: signed.data.session.access_token, expiresAt: signed.data.session.expires_at });
  }
  assert.ok(identities[0] && identities[1] && identities[0].id !== identities[1].id, 'Two distinct verified identities');
  const db = await isolatedPostgres();
  try {
    await command('pnpm', ['build'], { cwd: root, env: fixture.env, log: join(fixture.logs, 'build.log') });
    await command('pnpm', ['db:prepare'], { cwd: root, env: { ...fixture.env, MIGRATION_DATABASE_URL: db.setupUrl }, log: join(fixture.logs, 'prepare.log') });
    await db.grantServing();
    const port = await unusedPort();
    const origin = `http://127.0.0.1:${port}`;
    const serverLog = join(fixture.logs, 'server.log');
    const server = await start(process.execPath, ['apps/api/.mastra/output/index.mjs'], {
      cwd: root, env: { ...fixture.env, DATABASE_URL: db.servingUrl, PORT: String(port), SUPABASE_URL: local.url, SUPABASE_SECRET_KEY: local.secretKey }, log: serverLog,
    });
    const originalFetch = globalThis.fetch;
    const observed: string[] = [];
    globalThis.fetch = async (input, init) => {
      const response = await originalFetch(input, init);
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
      if (url.origin === origin) {
        const body: unknown = await response.clone().json().catch(() => null);
        observed.push(JSON.stringify({ method: init?.method ?? 'GET', path: url.pathname.replace(/[a-f0-9-]{36}/g, ':id'), status: response.status,
          requestKeys: typeof init?.body === 'string' ? Object.keys(JSON.parse(init.body) as object).sort() : [],
          responseKeys: body && typeof body === 'object' ? Object.keys(body).sort() : [] }));
      }
      return response;
    };
    try {
      await server.response(`${origin}/health`);
      const clients = identities.map((identity) => createConversationClient({ baseUrl: origin, resourceId: identity.id, getToken: async () => identity.token }));
      const a = clients[0]!;
      const b = clients[1]!;
      const first = await owned('create A', () => a.create('Checkpoint conversation A'));
      const second = await owned('create B', () => b.create('Checkpoint conversation B'));
      assert.ok(first.resourceId === identities[0]!.id && second.resourceId === identities[1]!.id, 'Native owners derive from actual verified sessions');
      const listedA = await owned('list A', () => a.list());
      const listedB = await owned('list B', () => b.list());
      assert.ok(listedA.threads.length === 1 && listedA.threads[0]?.id === first.id, 'A lists only its real native thread');
      assert.ok(listedB.threads.length === 1 && listedB.threads[0]?.id === second.id, 'B lists only its real native thread');
      const loaded = await owned('load A', () => a.load(first.id));
      assert.ok(loaded.id === first.id && loaded.resourceId === identities[0]!.id, 'Owned native load persists identity');
      const history = await owned('history A', () => a.history(first.id));
      assert.ok(history.messages.length === 0, 'Real native history starts empty, without invented responses');
      assert.ok(await rejects(() => b.load(first.id)), 'Typed client foreign load settles as rejection');
      assert.ok(await rejects(() => b.history(first.id)), 'Typed client foreign history settles as rejection');
      const foreign = await fetch(`${origin}/api/memory/threads/${first.id}?agentId=assistant`, { headers: { Authorization: `Bearer ${identities[1]!.token}` }, signal: AbortSignal.timeout(5000) });
      assert.equal(foreign.status, 404, 'Foreign references are non-disclosing');
      const missing = await fetch(`${origin}/api/memory/threads?agentId=assistant`, { signal: AbortSignal.timeout(5000) });
      assert.equal(missing.status, 401, 'Missing actual authentication is denied');
      const invalid = await fetch(`${origin}/api/memory/threads?agentId=assistant`, { headers: { Authorization: 'Bearer invalid-qualification-token' }, signal: AbortSignal.timeout(5000) });
      assert.equal(invalid.status, 401, 'Invalid actual authentication is denied');
      for (const [method, path] of [
        ['GET', '/api/agents'], ['GET', '/api/agents/assistant'], ['POST', '/api/agents/assistant/stream'],
        ['POST', '/api/agents/assistant/generate'], ['POST', '/api/agents/assistant/signals'], ['POST', '/api/agents/assistant/queue-signal'],
        ['POST', '/api/agents/assistant/recover'], ['POST', '/api/agents/assistant/model'], ['GET', '/api/workflows'],
        ['POST', '/api/tools/test/execute'], ['GET', '/api/logs'], ['GET', '/swagger-ui'], ['GET', '/openapi.json'],
        ['GET', '/__qualification'], ['POST', '/__qualification/release'],
      ] as const) {
        const response: Response = await fetch(`${origin}${path}`, { method, headers: { Authorization: `Bearer ${identities[0]!.token}` }, signal: AbortSignal.timeout(5000) });
        assert.equal(response.status, 404, `Unintended ${method} route is unavailable`);
      }
      for (const action of ['send-message', 'queue-message', 'threads/subscribe', 'threads/abort']) {
        const body = action === 'threads/abort' ? { threadId: first.id, expectedRunId: randomUUID() } :
          action === 'threads/subscribe' ? { threadId: first.id } : { threadId: first.id, resourceId: identities[1]!.id, message: 'Foreign input' };
        const response: Response = await fetch(`${origin}/api/agents/assistant/${action}`, {
          method: 'POST', headers: { Authorization: `Bearer ${identities[1]!.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000),
        });
        assert.equal(response.status, 404, 'Foreign native execution/observation is denied before side effects');
      }
      const reserved = await fetch(`${origin}/api/memory/threads?agentId=assistant`, {
        headers: { Authorization: `Bearer ${identities[0]!.token}`, 'x-resource-id': identities[1]!.id }, signal: AbortSignal.timeout(5000),
      });
      assert.equal(reserved.status, 400, 'Reserved browser context cannot grant authority');
      const studio = await fetch(`${origin}/api/memory/threads?agentId=assistant`, { headers: { 'x-mastra-client-type': 'studio' }, signal: AbortSignal.timeout(5000) });
      assert.equal(studio.status, 401, 'Studio header is not an authentication bypass');
      const forged = createConversationClient({ baseUrl: origin, resourceId: identities[0]!.id, getToken: async () => identities[1]!.token });
      assert.ok(await rejects(() => forged.create('Forged owner')), 'Browser account claims confer no authority');
      assert.ok((await owned('list after denial', () => b.list())).threads.length === 1, 'Denied owner forgery performs no native create');
      const unavailable = await fetch(`${origin}/api/agents/assistant/send-message`, {
        method: 'POST', headers: { Authorization: `Bearer ${identities[0]!.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: first.id, resourceId: identities[0]!.id, message: 'No unqualified provider call' }), signal: AbortSignal.timeout(5000),
      });
      assert.equal(unavailable.status, 503, 'Ordinary application reports unavailable before model calls');
      assert.ok(await rejects(() => a.send(first.id, 'Unavailable must settle')), 'Typed send settles without a fake assistant result');
      assert.ok((await owned('history after unavailable', () => a.history(first.id))).messages.length === 0, 'Unavailable causes no conversation message save');
      const malformed = await fetch(`${origin}/api/agents/assistant/send-message`, {
        method: 'POST', headers: { Authorization: `Bearer ${identities[0]!.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: first.id, resourceId: identities[0]!.id, message: 'No override', ifIdle: { streamOptions: { model: 'forged/model' } } }), signal: AbortSignal.timeout(5000),
      });
      assert.equal(malformed.status, 400, 'Client model/execution overrides are rejected');
      const verifier = createClient(local.url, local.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const token = identities[0]!.token; // Previously accepted by the real service, unchanged signature.
      await delay(Math.max(0, (identities[0]!.expiresAt + 2) * 1000 - Date.now()));
      const expired = await verifier.auth.getUser(token);
      assert.ok(expired.error && /expired|expiration/i.test(expired.error.message), 'The real service rejects this unchanged token specifically for expiry');
      const expiredRequest = await fetch(`${origin}/api/memory/threads?agentId=assistant`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) });
      assert.equal(expiredRequest.status, 401, 'Expired actual Supabase session is denied');
      t.diagnostic('Production route/context matrix passed; unchanged previously-valid token naturally expired and was rejected by real Supabase and native HTTP');
      t.diagnostic(`Observed native response keys: create=${Object.keys(first).sort().join(',')}; list=${Object.keys(listedA).sort().join(',')}; history=${Object.keys(history).sort().join(',')}`);
    } finally { globalThis.fetch = originalFetch; t.diagnostic(`Redacted native HTTP observations: ${observed.join('; ')}`); await server.stop(); }
    const captured = await readFile(serverLog, 'utf8');
    for (const value of [local.url, local.secretKey, ...local.accounts.flatMap((account) => [account.email, account.password]), ...identities.map((identity) => identity.token)]) {
      assert.ok(!captured.includes(value), 'Private local Auth material must not enter backend logs');
    }
  } finally { await db.close(); }
  await fixture.noNetwork();
  t.diagnostic(`Checkpoint evidence: ${fixture.logs}`);
});
