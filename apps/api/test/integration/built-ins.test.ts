import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Pool } from 'pg';
import { PostgresStore } from '@mastra/pg';
import type { Version } from '@workprint/contracts';
import { createArtifactStore, createArtifactWriters, createAssistantScripts, createVersionUses } from '../../src/artifacts/index.js';
import { createOwnedConversationCheck } from '../../src/agent/index.js';
import { createNativeConversation } from '../support/native-conversations.js';
import { query } from '../support/postgres.js';
import { testStack } from '../support/test-stack.js';
import { applyArtifactMigrations } from '../support/artifact-database.js';

const script = (action: string) => ({ schemaVersion: 1, scenes: [{ heading: { setting: 'interior', location: 'Station', time: 'morning' }, characters: ['Ada'], script: [{ action }] }] });

test('test-only sealed built-ins are readable and independently reusable but immutable through human, assistant and SQL writers', { timeout: 120000 }, async () => {
  const db = await testStack().testDatabase(), pool = new Pool({ connectionString: db.servingUrl, max: 4, connectionTimeoutMillis: 1000, statement_timeout: 2000 });
  const setup = new PostgresStore({ id: 'builtin-prerequisite', connectionString: db.setupUrl, schemaName: 'mastra' });
  const native = new PostgresStore({ id: 'builtin-serving', schemaName: 'mastra', disableInit: true, pool });
  try {
    await setup.init(); await db.grantServing(); await applyArtifactMigrations(db.setupUrl);
    const first = 'builtin-reader-one', second = 'builtin-reader-two', source = 'workprint-built-in';
    const ca = await createNativeConversation(setup, first), cb = await createNativeConversation(setup, second), origin = await createNativeConversation(setup, source);
    const check = createOwnedConversationCheck(native), store = createArtifactStore(pool, check), uses = createVersionUses(pool, check), writers = createArtifactWriters(pool, check);
    // Test-only setup seals ordinary prerequisite rows. There is no catalog/seed route.
    const example = await store.insert({ accountId: source, conversationId: origin.id, kind: 'script', content: script('An immutable example action.'), createdBy: 'human', dependencies: [] });
    const foreign = await store.insert({ accountId: second, conversationId: cb.id, kind: 'script', content: script('Private other-owner action.'), createdBy: 'human', dependencies: [] });
    await query(db.setupUrl, `UPDATE artifacts.artifacts SET built_in=true WHERE owner_id='workprint-built-in' AND artifact_id='${example.artifactId}'`);
    for (const [account, conversation] of [[first, ca.id], [second, cb.id]]) {
      const exact = await store.version(account!, example.id);
      assert.equal((exact as Version & { builtIn?: boolean }).builtIn, true, 'Read-only source metadata must come from stored server state');
      const listed = await store.library(account!, { kind: 'script', limit: 1 });
      assert.ok(listed.items.some(item => item.latestVersion.id === example.id) || listed.nextCursor, 'Built-in sources participate in ordinary bounded browsing');
      const approved = await uses.useVersion(account!, conversation!, { operationId: randomUUID(), versionId: example.id, purpose: 'script' });
      assert.equal(approved.use.versionId, example.id); assert.equal(approved.use.state, 'approved');
      const work = await store.workspace(account!, conversation!);
      assert.equal(work.script?.version.id, example.id); assert.equal((work.script?.version as Version & { builtIn?: boolean }).builtIn, true);
      const change = { operationId: randomUUID(), artifactId: example.artifactId, baseVersionId: example.id, kind: 'script' as const, content: script('A forbidden content edit.'), dependencies: [] };
      await assert.rejects(writers.human.save(account!, conversation!, change), { code: 'invalid_input' });
      await assert.rejects(writers.assistant.save(account!, conversation!, change), { code: 'invalid_input' });
    }
    await assert.rejects(store.version(first, foreign.id), { code: 'not_found' });
    await assert.rejects(uses.useVersion(first, ca.id, { operationId: randomUUID(), versionId: foreign.id, purpose: 'script' }), { code: 'not_found' });
    const history = await store.history(first, example.artifactId); assert.deepEqual(history.items.map(value => value.id), [example.id]);
    for (const sql of [
      `INSERT INTO artifacts.artifacts(owner_id,artifact_id,kind,built_in) VALUES('workprint-built-in','forbidden-builtin','script',true)`,
      `UPDATE artifacts.artifacts SET built_in=false WHERE artifact_id='${example.artifactId}'`,
      `INSERT INTO artifacts.versions(owner_id,version_id,artifact_id,kind,revision,schema_version,content,origin_conversation_id,created_by,provenance,publication_revision) SELECT owner_id,'${randomUUID()}',artifact_id,kind,2,schema_version,content,origin_conversation_id,created_by,provenance,publication_revision FROM artifacts.versions WHERE version_id='${example.id}'`,
    ]) await assert.rejects(query(db.servingUrl, sql), /./, 'Restricted SQL cannot mutate or forge sealed example content');
    await assert.rejects(query(db.setupUrl, `UPDATE artifacts.artifacts SET built_in=false WHERE artifact_id='${example.artifactId}'`), /./, 'A sealed artifact cannot be unsealed through ordinary writes');
    const rows = (await query(db.servingUrl, 'SELECT owner_id,version_id,state FROM artifacts.conversation_uses ORDER BY owner_id')).rows;
    assert.deepEqual(rows, [{ owner_id: first, version_id: example.id, state: 'approved' }, { owner_id: second, version_id: example.id, state: 'approved' }]);
    assert.deepEqual((await query(db.servingUrl, 'SELECT (SELECT count(*)::int FROM artifacts.artifacts) AS artifacts,(SELECT count(*)::int FROM artifacts.versions) AS versions,(SELECT count(*)::int FROM artifacts.commands) AS commands')).rows, [{ artifacts: 2, versions: 2, commands: 2 }]);
    const late = await store.insert({ accountId: source, conversationId: origin.id, kind: 'script', content: script('A test-only source sealed after a page.'), createdBy: 'human', dependencies: [] });
    await store.insert({ accountId: first, conversationId: ca.id, kind: 'script', content: script('An ordinary current-owner row.'), createdBy: 'human', dependencies: [] });
    const frozen = await store.library(first, { kind: 'script', limit: 1 }); assert.ok(frozen.nextCursor);
    await query(db.setupUrl, `UPDATE artifacts.artifacts SET built_in=true WHERE artifact_id='${late.artifactId}'`);
    const continuation = await store.library(first, { kind: 'script', limit: 1, cursor: frozen.nextCursor });
    assert.deepEqual(continuation.items.map(item => item.latestVersion.id), [example.id], 'Late sealing cannot enter a frozen Library window');
    assert.equal(continuation.nextCursor, null);
    const fresh = await store.library(first, { kind: 'script', limit: 100 });
    assert.ok(fresh.items.some(item => item.latestVersion.id === late.id), 'An explicit fresh read observes the newly sealed source');
    // The assistant may adapt a built-in script in use: its save starts the account's own script, on the same use.
    const used = (await store.workspace(first, ca.id)).script!.use!.id;
    const adapted = await createAssistantScripts(pool, check).save(first, ca.id, { baseVersionId: example.id, content: script('An adapted example action.') });
    assert.notEqual(adapted.version.artifactId, example.artifactId); assert.equal(adapted.version.revision, 1); assert.equal(adapted.version.createdBy, 'assistant');
    assert.equal(adapted.use.id, used); assert.equal(adapted.use.state, 'draft');
    assert.equal((await store.workspace(first, ca.id)).script?.version.id, adapted.version.id);
    assert.deepEqual((await store.history(first, example.artifactId)).items.map(value => value.id), [example.id], 'The built-in gains no version');
  } finally { await native.close(); if (!pool.ended) await pool.end(); await setup.close(); await db.close(); }
});
