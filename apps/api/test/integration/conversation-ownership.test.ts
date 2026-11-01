import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PostgresStore } from '@mastra/pg';
import { Pool } from 'pg';
import { createOwnedConversationCheck } from '../../src/agent/index.js';
import { createNativeConversation } from '../support/native-conversations.js';
import { isolatedPostgres } from '../support/postgres.js';

test('native ownership is account-exact, read-only and hides foreign or absent conversations', { timeout: 60000 }, async () => {
  const accountA = randomUUID(), accountB = randomUUID();
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
        assert.deepEqual(await check(accountA, a.id), { kind: 'owned' });
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
