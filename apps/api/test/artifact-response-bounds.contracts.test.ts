import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Pool } from 'pg';
import { createApiClient } from '@workprint/api-client';
import type { Version } from '@workprint/contracts';
import { createArtifactStore } from '../src/artifacts/index.js';
import { createOwnedConversationCheck } from '../src/agent/index.js';
import { createNativeConversation } from './native-conversations.js';
import { verifyBuiltAdmission } from './auth-built-fixture.js';

const pageBytes = 1024 * 1024;
const largeScript = { schemaVersion: 1, scenes: [{ heading: { setting: 'interior', location: 'Station', time: 'morning' }, characters: [], script: Array.from({ length: 13 }, () => ({ action: 'x'.repeat(19000) })) }] };

test('large valid saved records remain accessible through bounded history, Library and workspace responses', { timeout: 180000 }, async t => {
  let conversation = ''; let account = ''; const scripts: Version[] = []; const references: Version[] = [];
  await verifyBuiltAdmission(t, async target => {
    const client = createApiClient({ baseUrl: target.origin, getAccessToken: async () => target.accessTokens[0]! });
    await t.test('history emits byte-bounded pages without skipping the overflow item', async () => {
      const ids: string[] = []; let cursor: string | undefined; let pages = 0;
      do {
        const result = await client.artifactVersions({ params: { id: scripts[0]!.artifactId }, query: { ...(cursor ? { cursor } : {}) }, body: {} });
        assert.ok(result.ok, 'A valid large history page must remain readable by the real client');
        assert.ok(Buffer.byteLength(JSON.stringify(result.value)) <= pageBytes);
        ids.push(...result.value.items.map(item => item.id)); cursor = result.value.nextCursor ?? undefined;
        assert.ok(++pages <= 5, 'History must make progress');
      } while (cursor);
      assert.ok(pages > 1); assert.deepEqual(ids, scripts.toReversed().map(item => item.id));
      for (const version of scripts) { const exact = await client.version({ params: { id: version.id }, query: {}, body: {} }); assert.ok(exact.ok); assert.deepEqual(exact.value, version); }
    });
    await t.test('Library pages retain every latest-version identity at the serialized byte boundary', async () => {
      const ids: string[] = []; let cursor: string | undefined; let pages = 0;
      do {
        const result = await client.library({ params: {}, query: { ...(cursor ? { cursor } : {}) }, body: {} });
        assert.ok(result.ok, 'A valid large Library page must remain readable by the real client');
        assert.ok(Buffer.byteLength(JSON.stringify(result.value)) <= pageBytes);
        ids.push(...result.value.items.map(item => item.latestVersion.id)); cursor = result.value.nextCursor ?? undefined;
        assert.ok(++pages <= 6, 'Library must make progress');
      } while (cursor);
      assert.ok(pages > 1); assert.equal(new Set(ids).size, 6);
      assert.deepEqual(new Set(ids), new Set([...references.map(item => item.id), scripts.at(-1)!.id]));
    });
    await t.test('workspace retains exact large conversation uses under its explicit aggregate bound', async () => {
      const result = await client.workspace({ params: { id: conversation }, query: {}, body: {} });
      assert.ok(result.ok, 'A valid workspace larger than one MiB must remain accessible');
      assert.equal(result.value.script?.version.id, scripts[0]!.id);
      assert.equal(result.value.script?.state, 'Ready'); assert.equal(result.value.assets.length, 5);
      assert.deepEqual(result.value.assets.map(item => item.version.id), references.map(item => item.id));
      const bytes = Buffer.byteLength(JSON.stringify(result.value)); assert.ok(bytes > pageBytes && bytes <= 64 * pageBytes);
    });
  }, { prepareSavedWork: async setup => {
    account = setup.accountIds[0]!; conversation = (await createNativeConversation(setup.native, account)).id;
    const pool = new Pool({ connectionString: setup.servingUrl, max: 2, connectionTimeoutMillis: 1000, statement_timeout: 2000 });
    try {
      const store = createArtifactStore(pool, createOwnedConversationCheck(setup.native));
      for (let index = 0; index < 5; index++) scripts.push(await store.insert({ accountId: account, conversationId: conversation, kind: 'script', content: largeScript, dependencies: [], createdBy: 'human', ...(scripts[0] ? { artifactId: scripts[0].artifactId } : { use: { binding: { purpose: 'script' }, state: 'approved' } }) }));
      for (let index = 0; index < 5; index++) references.push(await store.insert({ accountId: account, conversationId: conversation, kind: 'reference', content: { schemaVersion: 1, subject: { id: `reference-${index}`, kind: 'character', name: `Reference ${index}`, description: 'A text-only reference.', continuityNotes: Array.from({ length: 13 }, () => 'y'.repeat(19000)) }, references: [] }, dependencies: [], createdBy: 'human', use: { binding: { purpose: 'reference', role: `reference-${index}` }, state: 'draft' } }));
    } finally { await pool.end(); }
  } });
});
