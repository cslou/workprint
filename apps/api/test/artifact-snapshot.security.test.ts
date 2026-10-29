import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { test } from 'node:test';
import { Pool, type PoolClient } from 'pg';
import { PostgresStore } from '@mastra/pg';
import { createArtifactStore } from '../src/artifacts/index.js';
import { createOwnedConversationCheck } from '../src/agent/index.js';
import { createNativeConversation } from './native-conversations.js';
import { isolatedPostgres, query } from './postgres.js';
import { applyArtifactMigrations } from './artifact-database.js';

const content = { schemaVersion: 1, scenes: [{ heading: { setting: 'interior', location: 'Station', time: 'morning' }, characters: [], script: [{ action: 'A traveller waits.' }] }] };

test('a delayed publication cannot change Library snapshot membership after the first page', { timeout: 120000 }, async () => {
  const db = await isolatedPostgres();
  const pool = new Pool({ connectionString: db.servingUrl, max: 4, application_name: 'saved-library-delayed-reader', connectionTimeoutMillis: 1000, statement_timeout: 2000 });
  const native = new PostgresStore({ id: 'delayed-publication-fixture', connectionString: db.setupUrl, schemaName: 'mastra' });
  let release = () => {}; let pending: Promise<unknown> | undefined; let publication: Promise<unknown> | undefined;
  try {
    await native.init(); await db.grantServing(); await applyArtifactMigrations(db.setupUrl);
    const conversation = await createNativeConversation(native, 'owner');
    const owned = createOwnedConversationCheck(native);
    const reader = createArtifactStore(pool, owned);
    const input = { accountId: 'owner', conversationId: conversation.id, kind: 'script' as const, content, dependencies: [], createdBy: 'human' as const };
    const original = await reader.insert(input); const other = await reader.insert(input);
    let held!: () => void; const available = new Promise<void>(resolve => { held = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const writerPool = new Proxy(pool, { get(target, property) {
      if (property === 'connect') return async () => {
        const client = await target.connect();
        return new Proxy(client, { get(connection, key) {
          if (key === 'query') return async (sql: string, values?: unknown[]) => { if (sql === 'COMMIT') { held(); await gate; } return await connection.query(sql, values); };
          const value: unknown = Reflect.get(connection, key); return typeof value === 'function' ? value.bind(connection) : value;
        } }) as PoolClient;
      };
      const value: unknown = Reflect.get(target, property); return typeof value === 'function' ? value.bind(target) : value;
    } });
    const writer = createArtifactStore(writerPool, owned);
    const written = writer.insert({ ...input, artifactId: original.artifactId }); publication = written;
    await available;
    let settled = false;
    const first = reader.library('owner', { limit: 1 }); pending = first;
    void first.then(() => { settled = true; }, () => { settled = true; });
    let waiting = false; const deadline = Date.now() + 2000;
    while (!settled && !waiting && Date.now() < deadline) {
      waiting = (await query(db.adminUrl, "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='saved-library-delayed-reader' AND wait_event_type='Lock' AND state='active') AS waiting")).rows[0]?.waiting === true;
      await setImmediate();
    }
    assert.ok(waiting && !settled, 'The first-page visibility boundary must wait for an already publishing owned version');
    release(); const latest = await written; const page = await first;
    assert.ok(page.nextCursor); const continuation = await reader.library('owner', { limit: 1, cursor: page.nextCursor });
    assert.equal(continuation.nextCursor, null);
    const versions = [...page.items, ...continuation.items].map(item => item.latestVersion.id);
    assert.deepEqual(new Set(versions), new Set([latest.id, other.id])); assert.equal(versions.length, 2);
  } finally {
    release(); await Promise.allSettled([pending, publication].filter((value): value is Promise<unknown> => !!value));
    await native.close(); await pool.end(); await db.close();
  }
});
