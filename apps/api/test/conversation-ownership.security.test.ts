import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PostgresStore } from '@mastra/pg';
import { Pool } from 'pg';
import { createApplication, unavailableApplication } from '../src/application/index.js';
import { createOwnedConversationCheck } from '../src/agent/index.js';
import { verifyAccount } from '../src/mastra/auth.js';
import { createNativeConversation } from './native-conversations.js';
import { isolatedPostgres } from './postgres.js';

async function verifiedFixtureAccounts() {
  const file = process.env.WORKPRINT_AUTH_FIXTURE;
  assert.ok(file, 'Supply the authorized loopback Auth fixture');
  let config: { url: string; anonKey: string; accounts: { email: string; password: string }[] };
  try { config = JSON.parse(await readFile(file, 'utf8')) as typeof config; }
  catch { throw new Error('Unable to read private Auth fixture; inspect it privately'); }
  assert.equal(new URL(config.url).origin, config.url);
  assert.equal(new URL(config.url).hostname, '127.0.0.1', 'Only the authorized loopback Auth target is permitted');
  assert.equal(config.accounts.length, 2);
  const ids: string[] = [];
  for (const account of config.accounts) {
    assert.ok(/@[^@]+\.invalid$/.test(account.email), 'Only synthetic identities are permitted');
    const response = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: config.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(account), signal: AbortSignal.timeout(3000), redirect: 'error',
    });
    assert.equal(response.status, 200, 'Authorized fixture sign-in');
    const identity = await response.json() as { access_token: string };
    const admission = await verifyAccount(`Bearer ${identity.access_token}`, { url: config.url, key: config.anonKey });
    assert.equal(admission.kind, 'verified', 'Identity comes from online Supabase verification');
    if (admission.kind !== 'verified') throw new Error('Fixture identity verification failed');
    ids.push(admission.accountId);
  }
  assert.ok(ids[0] !== ids[1], 'Fixture identities must be distinct');
  return [ids[0]!, ids[1]!] as const;
}

test('native ownership is account-exact, read-only and hides foreign or absent conversations', { timeout: 60000 }, async () => {
  const [accountA, accountB] = await verifiedFixtureAccounts();
  const db = await isolatedPostgres();
  try {
    const setup = new PostgresStore({ id: 'ownership-fixture', connectionString: db.setupUrl, schemaName: 'mastra' });
    try {
      await setup.init();
      const a = await createNativeConversation(setup, accountA, [{ role: 'user', text: 'Synthetic first message' }, { role: 'assistant', text: 'Synthetic saved response, not model output' }]);
      const b = await createNativeConversation(setup, accountB);
      const memory = await setup.getStore('memory');
      assert.ok(memory);
      const messages = await memory.listMessages({ threadId: a.id, resourceId: accountA, perPage: 100, orderBy: { field: 'createdAt', direction: 'ASC' } });
      assert.equal(messages.messages.length, 2, 'Optional native messages were persisted');
      assert.ok(messages.messages.every(message => message.threadId === a.id && message.resourceId === accountA));
      assert.deepEqual(messages.messages.map(message => message.role), ['user', 'assistant']);
      assert.equal((await memory.listMessages({ threadId: b.id, resourceId: accountB, perPage: 100 })).messages.length, 0);
      const snapshot = async () => JSON.stringify({
        threads: await memory.listThreads({ page: 0, perPage: 100 }),
        messages: await memory.listMessages({ threadId: [a.id, b.id], perPage: 100 }),
      });
      const before = await snapshot();
      await db.grantServing();
      // Real restricted serving reads also succeed with all writes forbidden by Postgres.
      const pool = new Pool({ connectionString: db.servingUrl, max: 1, connectionTimeoutMillis: 1000, statement_timeout: 2000, options: '-c default_transaction_read_only=on' });
      const serving = new PostgresStore({ id: 'ownership-serving', schemaName: 'mastra', disableInit: true, pool });
      try {
        const check = createOwnedConversationCheck(serving);
        const application = createApplication({ checkOwnedConversation: check });
        assert.equal(application.operations, unavailableApplication, 'No application operation becomes available');
        assert.equal(application.checkOwnedConversation, check, 'Application receives the supplied collaborator');
        assert.deepEqual(await application.checkOwnedConversation(accountA, a.id), { kind: 'owned' });
        assert.deepEqual(await check(accountB, b.id), { kind: 'owned' });
        const absent = await check(accountA, randomUUID());
        assert.deepEqual(absent, { kind: 'not_found' });
        assert.deepEqual(await check(accountA, b.id), absent);
        assert.deepEqual(await check(accountB, a.id), absent);
        assert.deepEqual(await check(` ${accountA}`, a.id), absent, 'Resource identity comparison is exact, without normalization');
        for (const id of ['', '.', '..', '\u0000', 'x'.repeat(201), "' OR '1'='1"]) assert.deepEqual(await check(accountA, id), absent);
        assert.ok(await snapshot() === before, 'Ownership reads changed no native thread or message');
        await pool.end();
        assert.deepEqual(await check(accountA, a.id), { kind: 'unavailable', reason: 'native_storage' }, 'A real closed pool cannot report ownership');
      } finally {
        await serving.close();
        if (!pool.ended) await pool.end();
      }
    } finally { await setup.close(); }
  } finally { await db.close(); }
});

test('ownership rejects malformed IDs before storage and types missing or failed storage', async () => {
  let calls = 0;
  const missing = createOwnedConversationCheck({ async getStore() { calls++; return undefined; } });
  for (const id of ['', '.', '..', '\u0000', 'x'.repeat(201)]) assert.deepEqual(await missing('verified-account', id), { kind: 'not_found' });
  assert.equal(calls, 0, 'Malformed IDs never reach a native query');
  assert.deepEqual(await missing('verified-account', randomUUID()), { kind: 'unavailable', reason: 'native_storage' });
  const failed = createOwnedConversationCheck({ async getStore() { throw new Error('Private native storage failure'); } });
  assert.deepEqual(await failed('verified-account', randomUUID()), { kind: 'unavailable', reason: 'native_storage' });
});
