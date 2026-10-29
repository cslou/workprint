import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { Pool } from 'pg';
import { PostgresStore } from '@mastra/pg';
import type { OperationResponse, Version } from '@workprint/contracts';
import { createOwnedConversationCheck } from '../src/agent/index.js';
import { createNativeConversation } from './native-conversations.js';
import { isolatedPostgres, query } from './postgres.js';
import { applyArtifactMigrations } from './artifact-database.js';

type Insert = { accountId: string; conversationId: string; kind: 'script'; content: Record<string, unknown>; dependencies: string[]; artifactId?: string; createdBy: 'human' | 'assistant'; use?: { binding: { purpose: 'script' }; state: 'draft' | 'approved' } };
type Store = {
  insert(input: Insert): Promise<Version>;
  version(account: string, id: string): Promise<Version>;
  workspace(account: string, conversation: string): Promise<OperationResponse<'workspace'>>;
  history(account: string, artifact: string, page?: { cursor?: string; limit?: number }): Promise<OperationResponse<'artifactVersions'>>;
  library(account: string, page?: { cursor?: string; limit?: number; kind?: 'script' | 'reference' }): Promise<OperationResponse<'library'>>;
};
const content = { schemaVersion: 1, scenes: [{ heading: { setting: 'interior', location: 'Station', time: 'morning' }, characters: [], script: [{ action: 'An empty train arrives.' }] }] };

test('owned persistence and reads keep exact uses, immutable history, scoped stable pages and nondisclosing denials', { timeout: 120000 }, async () => {
  const db = await isolatedPostgres();
  const pool = new Pool({ connectionString: db.servingUrl, max: 4, connectionTimeoutMillis: 1000, statement_timeout: 2000 });
  const native = new PostgresStore({ id: 'artifact-reads-native', connectionString: db.setupUrl, schemaName: 'mastra' });
  const serving = new PostgresStore({ id: 'artifact-reads-serving', schemaName: 'mastra', disableInit: true, pool });
  try {
    await native.init(); await db.grantServing(); await applyArtifactMigrations(db.setupUrl);
    const a = await createNativeConversation(native, 'account-a');
    const other = await createNativeConversation(native, 'account-b');
    const module = await import(pathToFileURL(resolve('apps/api/.test-build/src/artifacts/store.js')).href) as { createArtifactStore(pool: Pool, check: ReturnType<typeof createOwnedConversationCheck>): Store };
    const store = module.createArtifactStore(pool, createOwnedConversationCheck(serving));
    const empty = await store.workspace('account-a', a.id);
    assert.deepEqual(empty, { script: null, assets: [], storyboard: { work: null, shots: [] }, videos: [], pendingQuestion: null, activeWork: [], selectionRevision: 0 });
    const insert: Insert = { accountId: 'account-a', conversationId: a.id, kind: 'script', content, dependencies: [], createdBy: 'human' };
    const first = await store.insert({ ...insert, use: { binding: { purpose: 'script' }, state: 'approved' } });
    const second = await store.insert({ ...insert, artifactId: first.artifactId, dependencies: [first.id] });
    assert.equal(second.revision, 2);
    assert.deepEqual((await store.version('account-a', second.id)).dependencies, [first.id]);
    const restored = await store.version('account-a', first.id);
    assert.ok('content' in restored); assert.deepEqual(restored.content, content);
    const work = await store.workspace('account-a', a.id);
    assert.equal(work.script?.version.id, first.id, 'A newer Library version never replaces an exact conversation use');
    assert.equal(work.script?.state, 'Ready');
    assert.equal((await store.library('account-a')).items[0]?.latestVersion.id, second.id);
    const page = await store.history('account-a', first.artifactId, { limit: 1 });
    assert.deepEqual(page.items.map(item => item.id), [second.id]); assert.ok(page.nextCursor);
    await store.insert({ ...insert, artifactId: first.artifactId });
    assert.deepEqual((await store.history('account-a', first.artifactId, { limit: 1, cursor: page.nextCursor })).items.map(item => item.id), [first.id], 'Concurrent inserts do not shift the established history');
    await store.insert(insert);
    const libraryPage = await store.library('account-a', { limit: 1, kind: 'script' });
    assert.ok(libraryPage.nextCursor);
    await store.insert(insert);
    const next = await store.library('account-a', { limit: 1, kind: 'script', cursor: libraryPage.nextCursor });
    assert.equal(next.items.length, 1); assert.equal(next.nextCursor, null, 'New artifacts are outside the page snapshot');
    for (const action of [
      () => store.history('account-b', first.artifactId), () => store.version('account-b', first.id),
      () => store.version('account-a', 'unknown'), () => store.workspace('account-a', other.id),
      () => store.workspace('account-a', 'unknown'),
    ]) await assert.rejects(action, { code: 'not_found', message: 'Saved work not found' });
    for (const action of [
      () => store.library('account-b', { limit: 1, kind: 'script', cursor: libraryPage.nextCursor! }),
      () => store.library('account-a', { limit: 1, kind: 'reference', cursor: libraryPage.nextCursor! }),
      () => store.history('account-a', first.artifactId, { cursor: page.nextCursor! + 'x', limit: 1 }),
      () => store.library('account-a', { limit: 101 }),
    ]) await assert.rejects(action, { code: 'invalid_input' });
    const counts = async () => (await query(db.servingUrl, 'SELECT (SELECT count(*) FROM artifacts.artifacts) AS artifacts, (SELECT count(*) FROM artifacts.versions) AS versions, (SELECT count(*) FROM artifacts.conversation_uses) AS uses')).rows;
    const before = await counts();
    const foreign = await store.insert({ ...insert, accountId: 'account-b', conversationId: other.id });
    const afterForeign = await counts();
    for (const input of [
      { ...insert, conversationId: other.id }, { ...insert, dependencies: [foreign.id] },
      { ...insert, dependencies: ['unknown'] }, { ...insert, artifactId: foreign.artifactId },
      { ...insert, createdBy: 'assistant' as const, use: { binding: { purpose: 'script' as const }, state: 'approved' as const } },
    ]) await assert.rejects(store.insert(input));
    assert.deepEqual(await counts(), afterForeign, 'Denied fixture/domain writes leave no partial rows');
    assert.notDeepEqual(before, afterForeign);
    await assert.rejects(query(db.setupUrl, `UPDATE artifacts.versions SET revision=99 WHERE version_id='${first.id}'`), /immutable/);
    await assert.rejects(query(db.servingUrl, "INSERT INTO artifacts.version_dependencies(owner_id,version_id,dependency_id,position) VALUES('account-a','unknown','missing',0)"), /foreign key/);
  } finally {
    await native.close(); await serving.close(); if (!pool.ended) await pool.end(); await db.close();
  }
});
